1. Llenar corpus: `node slm/generar_lote.js 500` (usa tus keys de .env; 6 s entre llamadas; repetir hasta >=5000) + dejar jugar al bot (corpus_am.json) + opcional texto propio en `slm/datos/*.txt` (una frase por linea).
2. `python slm/preparar.py` (SLM_MIN_R=0.3 para filtrar solo frases efectivas del juego).
3. `pip install torch onnx onnxscript` y `python slm/entrenar.py` (GPU recomendada; Colab sirve; SLM_EPOCAS, SLM_D, SLM_L).
4. Copiar `slm/modelo.onnx` y `slm/vocab.json` junto al bot, `npm i onnxruntime-node`. El bot lo carga solo.
Vars: IA_SLM=0 apaga, IA_SLM_P (prob. base, default 0.3; se ajusta sola segun el resultado de sus frases vs LLM).
Si npm i onnxruntime-node falla en el postinstall: npm i onnxruntime-node --ignore-scripts
