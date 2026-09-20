@echo off
title Nova Music Player - PC Test
cd /d "%~dp0"
echo Starting Nova Music Player on http://localhost:8000 ...
echo Keep this window open. Press Ctrl+C to stop.
python -m http.server 8000
pause
