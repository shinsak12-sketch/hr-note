import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/chat', authMiddleware, async (req, res) => {
  const { messages, memoContent } = req.body;
  try {
    const systemPrompt = memoContent
      ? `당신은 HR 업무를 돕는 AI 어시스턴트입니다. 한국어로 친절하게 답변해주세요.\n\n현재 메모 내용:\n${memoContent}`
      : '당신은 HR 업무를 돕는 AI 어시스턴트입니다. 한국어로 친절하게 답변해주세요.';

    // Gemini API 형식으로 변환
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 1000 },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI 오류');
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('응답을 받지 못했습니다.');
    res.json({ content });
  } catch(e) {
    console.error('AI chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
