import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 서명 발급 (프론트에서 직접 Cloudinary 업로드용)
router.get('/sign', authMiddleware, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'hr-note/memos';
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET
  );
  res.json({
    timestamp,
    signature,
    folder,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
  });
});

// 첨부파일 DB 저장 (업로드 완료 후 메타 저장)
router.post('/memo/:memoId', authMiddleware, async (req, res) => {
  const { file_name, file_url, file_type, file_size } = req.body;
  const [att] = await sql`
    INSERT INTO memo_attachments (memo_id, file_name, file_url, file_type, file_size)
    VALUES (${req.params.memoId}, ${file_name}, ${file_url}, ${file_type||null}, ${file_size||null})
    RETURNING *
  `;
  res.status(201).json(att);
});

// 첨부파일 목록 조회
router.get('/memo/:memoId', authMiddleware, async (req, res) => {
  const list = await sql`
    SELECT * FROM memo_attachments WHERE memo_id=${req.params.memoId} ORDER BY created_at ASC
  `;
  res.json(list);
});

// 첨부파일 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  const [att] = await sql`SELECT file_url FROM memo_attachments WHERE id=${req.params.id}`;
  if (att) {
    const publicId = att.file_url.split('/upload/')[1]?.replace(/\.[^/.]+$/, '');
    try { await cloudinary.uploader.destroy(publicId); } catch {}
  }
  await sql`DELETE FROM memo_attachments WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

export default router;
