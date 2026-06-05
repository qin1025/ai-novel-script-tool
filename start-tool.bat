@echo off
setlocal

set "PORT=5173"
set "APP_URL=http://127.0.0.1:%PORT%/index.html"

where py >nul 2>nul
if %errorlevel%==0 (
  start "AI Novel Script Tool Server" /D "%~dp0" cmd /k py -3 -m http.server %PORT% --bind 127.0.0.1
  goto open_app
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "AI Novel Script Tool Server" /D "%~dp0" cmd /k python -m http.server %PORT% --bind 127.0.0.1
  goto open_app
)

echo Python was not found. Install Python or run a local static server for this folder.
echo Then open %APP_URL%
pause
exit /b 1

:open_app
timeout /t 2 /nobreak >nul
start "" "%APP_URL%"
echo Opened %APP_URL%
