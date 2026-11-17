@echo off
setlocal
cd /d "%~dp0"
title AJS TRADING PRO - SERVER
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
:RUN_SERVER
echo.
echo Starting AJS TRADING PRO at http://localhost:3000 ...
call npm start
set EXITCODE=%ERRORLEVEL%
echo.
echo AJS server stopped with exit code %EXITCODE%.
echo Press R to restart, or Q to close this server window.
choice /c RQ /n /m "R = Restart    Q = Quit: "
if errorlevel 2 exit /b %EXITCODE%
goto RUN_SERVER
