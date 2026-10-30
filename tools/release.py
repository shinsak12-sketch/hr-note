#!/usr/bin/env python3
"""사업비 관리 프로그램 배포 zip 만들기

  python3 tools/release.py 출력.zip            처음 설치용: budget/program + 빈 budget/storage
  python3 tools/release.py 출력.zip --update   업데이트용: budget/program 만 (storage 는 안 건드림)

배포판에서 빼는 것: 테스트(더미) 데이터 js/testdata.js 와 그 <script> 줄, .txt 파일, 숨김 파일.
"""
import os
import sys
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "budget")
PROGRAM = os.path.join(ROOT, "program")
SKIP_FILES = {os.path.join("js", "testdata.js")}
TEST_TAG = '<script src="js/testdata.js"></script>'


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out, update = sys.argv[1], "--update" in sys.argv[2:]
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(PROGRAM):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for f in sorted(files):
                rel = os.path.relpath(os.path.join(base, f), PROGRAM)
                if f.startswith(".") or f.lower().endswith(".txt") or rel in SKIP_FILES:
                    continue
                arc = "budget/program/" + rel.replace(os.sep, "/")
                if rel == "index.html":
                    html = open(os.path.join(base, f), encoding="utf-8").read()
                    if TEST_TAG not in html:
                        sys.exit("index.html 에 testdata.js 줄이 없습니다 — release.py 를 확인하세요")
                    lines = [ln for ln in html.split("\n") if ln.strip() != TEST_TAG]
                    z.writestr(arc, "\n".join(lines))
                else:
                    z.write(os.path.join(base, f), arc)
        if not update:
            z.writestr("budget/storage/", "")
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
    print(out, "·", "업데이트용" if update else "처음 설치용", "·", len(names), "개")
    for n in names:
        print("  ", n)


if __name__ == "__main__":
    main()
