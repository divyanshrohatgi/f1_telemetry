@echo off
cd /d %~dp0
C:\Users\divya\anaconda3\python.exe -m uvicorn api.main:app --reload --port 8001
