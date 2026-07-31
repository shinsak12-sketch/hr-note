@echo off
chcp 65001 >nul
title 경리 콕핏
cd /d "%~dp0"
echo.
echo   경리 콕핏을 시작합니다...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [오류] Node.js 가 설치되어 있지 않습니다.
  echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)
node server.js
pause
