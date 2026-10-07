# AI 활용 등급 진단

강의 시작할 때 참가자가 QR로 들어와 8문항에 답하면, 강사 화면에 등급 분포가 실시간으로 모이는 설문.

| 주소 | 누가 | 화면 |
|---|---|---|
| `/` | 참가자 (휴대폰) | 닉네임·조 선택 → 8문항 → 등급 결과 카드 |
| `/host` | 강사 (빔프로젝터) | 큰 QR + 참여 인원 → `Space`로 결과 공개 |

## 등급

7개 객관식 문항 × 0~3점 = 21점 만점 (`public/survey.js`에서 문항·점수·기준을 한곳에서 고친다).

| 등급 | 점수 | 이름 |
|---|---|---|
| Lv.0 | 0~4 | 관망형 — AI? 아직 구경 중 |
| Lv.1 | 5~9 | 검색형 — 똑똑한 검색창으로 쓰는 중 |
| Lv.2 | 10~15 | 제작형 — AI로 결과물을 만든다 (오늘의 목표) |
| Lv.3 | 16~21 | 자동화형 — AI에게 일을 맡긴다 |

8번 문항 "AI한테 제일 떠넘기고 싶은 일"은 점수에 안 들어가고 강사 화면 아래 띠로 흐른다 (`W`로 숨김).

## 배포 (Vercel + Neon)

1. 이 레포를 Vercel에 Import (Framework Preset: **Other**, 빌드 설정은 기본값 그대로)
2. Vercel 프로젝트 → Storage → Neon 연결, 또는 Settings → Environment Variables에 `DATABASE_URL` = Neon 연결 문자열
3. 다시 배포. 테이블(`responses`)은 첫 요청 때 자동으로 만들어진다

## 강사 화면 사용법

- `Space` 또는 `R`: QR 화면 ↔ 결과 화면
- `F`: 전체 화면
- `W`: 한 줄 의견 띠 켜기/끄기
- 상단 **방** 버튼: 방 코드 변경. 같은 방 코드끼리만 모인다.
  기본값은 오늘 날짜(예: `261015`)라서, 리허설을 전날 하거나 `test` 같은 코드로 해 두면 본 강의 화면은 0명에서 깨끗하게 시작한다.
- QR에는 방 코드가 붙어 나가므로 참가자는 QR만 찍으면 된다.
- 결과 화면 오른쪽 위 작은 QR로 늦게 온 사람도 들어올 수 있다.

참가자는 같은 폰으로 다시 하면 기존 응답이 바뀐다 (사람당 1건). 집계는 2초마다 갱신.

## 로컬 리허설

```bash
npm install
DATABASE_URL="<Neon 연결 문자열>" npm run dev           # Neon 그대로
DATABASE_URL="postgres://..." LOCAL_PG=1 npm run dev    # 로컬 Postgres
```

`http://localhost:3000` (참가자), `http://localhost:3000/host` (강사)

## 구조

```
public/index.html    참가자 화면
public/host.html     강사 화면
public/survey.js     문항·점수·등급 (화면과 서버가 같이 씀)
public/vendor/       QR 생성기 (qrcode-generator, MIT)
api/submit.js        응답 저장 + 내 순위
api/stats.js         집계
lib/db.js            Neon 연결, 테이블 자동 생성
dev-server.js        로컬 실행용
```
