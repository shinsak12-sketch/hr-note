# HR노트 — 직원 이슈 관리 시스템

모바일 웹 기반의 직원 이슈 관리 앱입니다.

## 기술 스택
- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: Neon (PostgreSQL)
- **배포**: Render

---

## 설치 및 실행

### 1. Neon DB 설정
1. [neon.tech](https://neon.tech) 에서 프로젝트 생성
2. `backend/schema.sql` 내용을 Neon SQL 에디터에서 실행
3. Connection string 복사

### 2. 백엔드 설정
```bash
cd backend
cp .env.example .env
# .env 파일에 DATABASE_URL, JWT_SECRET 입력
npm install
npm run dev
```

### 3. 프론트엔드 설정
```bash
cd frontend
npm install
npm run dev
```

### 4. 기본 계정
- 아이디: `admin`
- 비밀번호: `admin1234` (첫 로그인 후 반드시 변경하세요)

---

## Render 배포

### 백엔드 (Web Service)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- 환경변수: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`

### 프론트엔드 (Static Site)
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- 환경변수: `VITE_API_URL` = 백엔드 URL + `/api`

---

## 주요 기능
- 로그인 / 다중 계정 관리
- 직원별 이슈 조회 (사번/성명 검색)
- 이슈별 조회 (구분코드/심각도/날짜 필터)
- 이슈 입력 / 수정 / 삭제
- 홈 대시보드 (현황 요약 + TOP3)
- 엑셀 내보내기
