@echo off
cd /d "%~dp0"
set Z=%TEMP%\am_repo.zip
set D=%TEMP%\am_repo
if exist "%D%" rmdir /s /q "%D%"
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing https://github.com/monledxd-cyber/ia-antagonista-bot/archive/refs/heads/main.zip -OutFile '%Z%'; Expand-Archive -Force '%Z%' '%D%'"
if errorlevel 1 (
  echo fallo la descarga
  pause
  exit /b 1
)
robocopy "%D%\ia-antagonista-bot-main" "%~dp0." /E /XD node_modules .git /XF iniciar.bat .env *_am.json memoria_jugadores.json datos_nn.json aprendizaje.json >nul
call npm install
echo listo
pause
