@echo off
echo Starting RAG Agent Workbench...
echo ================================

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Python is not installed
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    exit /b 1
)

REM Start server
echo Starting Python server...
cd server

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
)

pip install -r requirements.txt >nul 2>&1
start /B python main.py

cd ..

REM Start web
echo Starting React web...
cd web

if not exist "node_modules" (
    echo Installing web dependencies...
    call npm install
)

if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
)

start /B npm run dev

cd ..

echo ================================
echo Server running at: http://localhost:5000
echo Web running at: http://localhost:3000
echo Press Ctrl+C to stop (you may need to kill processes manually)
echo ================================

pause
