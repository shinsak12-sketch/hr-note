import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/chat', authMiddleware, async (req, res) => {
  const { messages, memoContent } = req.body;
  try {
    const systemPrompt = [
      '당신은 HR 업무를 돕는 AI 어시스턴트입니다.',
      '반드시 한국어로만 답변하세요. 영어나 다른 언어를 절대 사용하지 마세요.',
      memoContent ? `\n현재 메모 내용:\n${memoContent}` : ''
    ].join(' ');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1000,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI 오류');
    res.json({ content: data.choices[0].message.content });
  } catch(e) {
    console.error('AI chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
