@echo off
chcp 65001 >nul
title 경리 콕핏
cd /d "%~dp0"
echo.
echo   경리 콕핏을 시작합니다...
echo.

rem 1) 윈도우 기본 PowerShell 로 실행 (Node.js 불필요)
where powershell >nul 2>nul
if %errorlevel%==0 (
  powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1"
  goto :end
)

rem 2) PowerShell 이 없으면 Node.js 로 시도
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  goto :end
)

echo   [오류] PowerShell 과 Node.js 를 모두 찾을 수 없습니다.
echo   보통 윈도우에는 PowerShell 이 기본 설치되어 있습니다. 관리자에게 문의하세요.
echo.
pause

:end
