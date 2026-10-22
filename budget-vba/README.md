# 사업비 관리 프로그램 (엑셀 VBA 테스트판)

엑셀 매크로(VBA) 기반 사업비 관리 프로그램의 소스입니다.
프로그램 파일(`BudgetManager.xlsm`)과 연도별 데이터 파일(`data/budget_연도.xlsx`)을 나누는 구조입니다.

## 만들기

```bash
python3.13 build_app.py <출력폴더>          # 배포용
python3.13 build_app.py <출력폴더> --test   # 자동 점검용 (메시지 창 없이 동작, 시트 보호 끔)
```

`<출력폴더>/BudgetApp/` 아래에 프로그램, 2026년 샘플 데이터, backup 폴더가 만들어집니다.

## 구성

- `build_app.py` — 시트 디자인·수식·버튼·샘플 데이터를 만들고 VBA를 넣어 xlsm을 조립
- `vbaproj.py` — 엑셀 없이 `vbaProject.bin`을 만드는 최소 구현 (MS-OVBA 압축·암호화, MS-CFB 쓰기)
- `vba/App.bas` — 공통 (상수, 메시지, 화면 이동, 시트 보호, 이력)
- `vba/DataIO.bas` — 데이터 파일 열기·저장·백업, 새 연도
- `vba/Screens.bas` — 사업비계획·계획대비실적 화면 그리기, 실적 등록·삭제, 계정 반영
- `vba/*.cls` — 통합 문서·시트 이벤트
