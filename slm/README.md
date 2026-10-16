1. Llenar corpus: `node slm/generar_lote.js 500` (usa tus keys de .env; 6 s entre llamadas; repetir hasta >=5000) + dejar jugar al bot (corpus_am.json) + opcional texto propio en `slm/datos/*.txt` (una frase por linea).
2. `python slm/preparar.py` (SLM_MIN_R=0.3 para filtrar solo frases efectivas del juego).
3. `pip install torch onnx onnxscript` y `python slm/entrenar.py` (GPU recomendada; Colab sirve; SLM_EPOCAS, SLM_D, SLM_L).
4. Copiar `slm/modelo.onnx` y `slm/vocab.json` junto al bot, `npm i onnxruntime-node`. El bot lo carga solo.
Vars: IA_SLM=0 apaga, IA_SLM_P (prob. base, default 0.3; se ajusta sola segun el resultado de sus frases vs LLM).
Si npm i onnxruntime-node falla en el postinstall: npm i onnxruntime-node --ignore-scripts
Preentrenamiento: poner texto en espanol (libros, .txt) en `slm/preentrenar/`. entrenar.py primero aprende el idioma con eso (SLM_PRE_PASOS, default 4000) y despues ajusta con tus frases. Sin esa carpeta entrena como antes.
BPE (mejor que letra por letra): `py slm\entrenar_bpe.py` en vez de `entrenar.py`. Aprende un tokenizador BPE propio de tu corpus y libros (SLM_MERGES, default 1500), con prefijos como tokens especiales y ctx 128 tokens. Mismas variables que entrenar.py. slm.js carga ambos formatos solo.
