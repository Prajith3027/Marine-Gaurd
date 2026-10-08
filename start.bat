@echo off
title Marine Pollution Response System Launcher
echo ========================================================
echo   Starting Marine Pollution Response System
echo ========================================================
echo.

set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

echo [1/3] Starting FastAPI Backend on http://localhost:8000 ...
start "OilSpill Backend" cmd /k "cd /d ""%ROOT_DIR%"" && py -3.14 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload || python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload"

echo [2/3] Starting Vite Frontend on http://localhost:5173 ...
start "OilSpill Frontend" cmd /k "cd /d ""%ROOT_DIR%frontend"" && npm run dev"

echo [3/3] Opening browser at single project link...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================================
echo   READY! Application running at:
echo      👉 http://localhost:5173
echo ========================================================
echo Close the backend and frontend command windows to stop.
pause
