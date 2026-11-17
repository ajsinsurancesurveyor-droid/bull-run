@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installing application packages. Internet is required for this one-time step...
  call npm install
  if errorlevel 1 (
    echo Package installation failed. Read the npm error above.
    pause
    exit /b 1
  )
)
start "AJS TRADING PRO SERVER" "%ComSpec%" /k ""%~dp0RUN_AJS_SERVER.bat""
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000"
