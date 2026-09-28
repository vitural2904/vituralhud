@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Can Node.js 22.19 tro len trong nhanh 22.
  pause
  exit /b 1
)
node scripts/launch.mjs
if errorlevel 1 (
  echo [LOI] Khong the khoi dong. Xem thong bao phia tren.
  pause
  exit /b 1
)
