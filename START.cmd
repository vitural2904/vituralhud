@echo off
setlocal EnableExtensions
title VirtualHUD Launcher

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua co Node.js 22.
  echo Cai Node.js 22 LTS. Chay lai file nay.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not "%NODE_MAJOR%"=="22" (
  echo [LOI] Can Node.js 22 LTS.
  echo Ban dang dung Node.js %NODE_MAJOR%.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua co npm.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Dang cai thu vien...
  call npm ci
  if errorlevel 1 goto :fail
)

echo Dang build...
call npm run build
if errorlevel 1 goto :fail

netstat -ano | findstr "127.0.0.1:4174" | findstr "LISTENING" >nul
if not errorlevel 1 goto :wait

echo Dang khoi dong VirtualHUD...
start "VirtualHUD Server" /MIN cmd /k "cd /d ""%~dp0"" && npm start"

:wait
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(Get-Date).AddSeconds(20); do { try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4174/api/health -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $d); exit 1"
if errorlevel 1 goto :fail

:open
if /I "%VIRTUALHUD_NO_BROWSER%"=="1" exit /b 0
start "" "http://127.0.0.1:4174/control"
exit /b 0

:fail
echo [LOI] Khong the khoi dong.
pause
exit /b 1
