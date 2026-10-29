@echo off
cd /d "%~dp0"
set AM_DEBUG=1
node chat.js %1
pause
