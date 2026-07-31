#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  경리 콕핏을 시작합니다..."
echo ""
URL="http://localhost:4173"
if command -v node >/dev/null 2>&1; then
  node server.js
elif command -v python3 >/dev/null 2>&1; then
  ( sleep 1; open "$URL" ) &
  echo "  실행 중 -> $URL   (이 창을 닫으면 종료)"
  python3 -m http.server 4173
else
  echo "  [오류] Node.js 또는 python3 가 필요합니다."
  echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
fi
