@echo off
cd /d "%~dp0"
if not exist slm\respaldo mkdir slm\respaldo
copy /y slm\modelo.onnx slm\respaldo\ >nul
copy /y slm\vocab.json slm\respaldo\ >nul
set SLM_D=192
set SLM_L=6
set SLM_H=6
set SLM_MERGES=2500
set SLM_PRE_PASOS=3000
set SLM_PACIENCIA=8
py slm\preparar.py
py slm\entrenar_bpe.py
echo.
echo listo. si queda peor: copy /y slm\respaldo\* slm\
pause
