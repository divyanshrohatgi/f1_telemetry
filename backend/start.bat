@echo off
cd /d %~dp0
.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8002
