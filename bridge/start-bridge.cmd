@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -STA -File talkpet-bridge.ps1 %*
pause
