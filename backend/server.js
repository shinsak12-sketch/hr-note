import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import issuesRouter from './routes/issues.js';
import tasksRouter from './routes/tasks.js';
import memosRouter from './routes/memos.js';
import officesRouter from './routes/offices.js';
import housingRouter from './routes/housing.js';
import assetsRouter from './routes/assets.js';
import repairsRouter from './routes/repairs.js';
import attendanceRouter from './routes/attendance.js';
import orgmapRouter from './routes/orgmap.js';
import employeesRouter from './routes/employees.js';
import aiRouter from './routes/ai.js';
import logsRouter from './routes/logs.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
console.log(`포트: ${PORT}`);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/memos', memosRouter);
app.use('/api/offices', officesRouter);
app.use('/api/housing', housingRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/repairs', repairsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/orgmap', orgmapRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/logs', logsRouter);

// 접속/이용 로그 미들웨어
import { writeLog } from './routes/logs.js';
const LOG_ACTIONS = {
  'POST /api/auth/login': '로그인',
  'POST /api/attendance': '근태등록',
  'DELETE /api/attendance/:id': '근태삭제',
  'POST /api/housing': '사택등록',
  'POST /api/housing/apply': '사택신청',
  'POST /api/memos': '메모작성',
  'DELETE /api/memos/:id': '메모삭제',
};
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      const key = `${req.method} ${req.path.replace(/\/\d+/g, '/:id')}`;
      const action = LOG_ACTIONS[key];
      if (action && req.user) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        writeLog(req.user, action, req.path, null, ip);
      }
    }
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`HR노트 서버 실행 중: http://localhost:${PORT}`);
});

// 음양력 변환 프록시
app.get('/api/lunar', async (req, res) => {
  const { solYear, solMonth, solDay, type, lunLeapmonth } = req.query;
  const key = process.env.LUNAR_API_KEY || '7ee0ddf1df26d71805f93d0e43dbfe81fd947075e53d361ac0e025dbb80ad698';
  try {
    let url;
    const mm = String(solMonth).padStart(2,'0');
    const dd = String(solDay).padStart(2,'0');
    if (type === 'sol2lun') {
      url = `https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getLunCalInfo?serviceKey=${key}&solYear=${solYear}&solMonth=${mm}&solDay=${dd}&_type=json`;
    } else {
      url = `https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getSolCalInfo?serviceKey=${key}&lunYear=${solYear}&lunMonth=${mm}&lunDay=${dd}&lunLeapmonth=${lunLeapmonth||'N'}&_type=json`;
    }
    const response = await fetch(url);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // XML 응답인 경우 에러 메시지 추출
      const errMatch = text.match(/<errMsg>(.*?)<\/errMsg>/);
      const codeMatch = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/);
      return res.status(400).json({ error: errMatch?.[1] || codeMatch?.[1] || 'API 응답 오류' });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
