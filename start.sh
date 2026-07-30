#!/bin/bash

echo "Starting RAG Agent Workbench..."
echo "================================"

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "Error: Python is not installed"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Start server in background
echo "Starting Python server..."
cd server
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating one..."
    python -m venv venv
fi

source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
fi

pip install -r requirements.txt > /dev/null 2>&1
python main.py &
SERVER_PID=$!
cd ..

# Start web in background
echo "Starting React web..."
cd web
if [ ! -d "node_modules" ]; then
    echo "Installing web dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
fi

npm run dev &
WEB_PID=$!
cd ..

echo "================================"
echo "Server running at: http://localhost:5000"
echo "Web running at: http://localhost:3000"
echo "Press Ctrl+C to stop all services"
echo "================================"

# Handle Ctrl+C
trap "echo 'Stopping services...'; kill $SERVER_PID $WEB_PID; exit" INT

# Wait for both processes
wait
