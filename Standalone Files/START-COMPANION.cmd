@echo off
setlocal
cd /d "%~dp0companion"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<20){console.error('Node.js 20 or newer is required.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8788 in Chrome or Edge after the companion starts.
node server.mjs
pause
