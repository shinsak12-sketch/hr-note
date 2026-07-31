#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  경리 콕핏을 시작합니다..."
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  [오류] Node.js 가 설치되어 있지 않습니다."
  echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi
node server.js
