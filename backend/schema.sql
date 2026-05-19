-- HR노트 데이터베이스 스키마

-- 관리자 계정 테이블
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 이슈 테이블
CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  emp_no VARCHAR(20) NOT NULL,
  emp_name VARCHAR(50) NOT NULL,
  department VARCHAR(100),
  rank VARCHAR(50),
  position VARCHAR(50),
  issue_date DATE NOT NULL,
  issue_type VARCHAR(20) NOT NULL CHECK (issue_type IN ('질병', '노무', '사고', '사건', '기타')),
  severity VARCHAR(5) NOT NULL CHECK (severity IN ('상', '중', '하')),
  related_person VARCHAR(200),
  action_taken TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 기본 관리자 계정 생성 (비밀번호: admin1234 → 실제 사용 시 변경)
-- bcrypt hash of 'admin1234'
INSERT INTO users (username, password_hash, name)
VALUES ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '관리자')
ON CONFLICT (username) DO NOTHING;
