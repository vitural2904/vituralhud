@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Can Node.js de dung app.
  pause
  exit /b 1
)
node scripts/stop.mjs
if errorlevel 1 (
  echo [LOI] Khong the dung app. Xem thong bao phia tren.
  pause
  exit /b 1
)
