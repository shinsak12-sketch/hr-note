import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/chat', authMiddleware, async (req, res) => {
  const { messages } = req.body;
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-2-1212',
        messages: [
          { role: 'system', content: '당신은 HR 업무를 돕는 AI 어시스턴트입니다. 한국어로 친절하게 답변해주세요.' },
          ...messages,
        ],
        max_tokens: 1000,
      }),
    });
    const data = await response.json();
    console.log('xAI response:', response.status, JSON.stringify(data).slice(0, 200));
    if (!response.ok) throw new Error(data.error?.message || 'AI 오류');
    res.json({ content: data.choices[0].message.content });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
