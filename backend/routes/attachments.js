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
  try {
    const [att] = await sql`SELECT file_url FROM memo_attachments WHERE id=${req.params.id}`;
    await sql`DELETE FROM memo_attachments WHERE id=${req.params.id}`;
    res.json({ ok: true });
    // Cloudinary 삭제는 응답 후 비동기로 처리
    if (att?.file_url) {
      try {
        const parts = att.file_url.split('/upload/');
        if (parts[1]) {
          const publicId = parts[1].replace(/\?.*$/, '').replace(/\.[^/.]+$/, '');
          await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
        }
      } catch(e) { console.error('Cloudinary 삭제 실패:', e.message); }
    }
  } catch(e) {
    console.error('첨부파일 삭제 오류:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

export default router;
