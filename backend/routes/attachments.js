import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 첨부파일 목록 조회
router.get('/memo/:memoId', authMiddleware, async (req, res) => {
  const list = await sql`
    SELECT * FROM memo_attachments WHERE memo_id=${req.params.memoId} ORDER BY created_at ASC
  `;
  res.json(list);
});

// 첨부파일 업로드
router.post('/memo/:memoId', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

  // cloudinary 업로드
  const b64 = Buffer.from(file.buffer).toString('base64');
  const dataUri = `data:${file.mimetype};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'hr-note/memos',
    resource_type: 'auto',
    public_id: `memo_${req.params.memoId}_${Date.now()}`,
  });

  const [att] = await sql`
    INSERT INTO memo_attachments (memo_id, file_name, file_url, file_type, file_size)
    VALUES (${req.params.memoId}, ${file.originalname}, ${result.secure_url}, ${file.mimetype}, ${file.size})
    RETURNING *
  `;
  res.status(201).json(att);
});

// 첨부파일 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  const [att] = await sql`SELECT file_url FROM memo_attachments WHERE id=${req.params.id}`;
  if (att) {
    // cloudinary에서도 삭제
    const publicId = att.file_url.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
    try { await cloudinary.uploader.destroy(publicId); } catch {}
  }
  await sql`DELETE FROM memo_attachments WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

export default router;
