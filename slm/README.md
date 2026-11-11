1. Llenar corpus: `node slm/generar_lote.js 500` (usa tus keys de .env; 6 s entre llamadas; repetir hasta >=5000) + dejar jugar al bot (corpus_am.json) + opcional texto propio en `slm/datos/*.txt` (una frase por linea).
2. `python slm/preparar.py` (SLM_MIN_R=0.3 para filtrar solo frases efectivas del juego).
3. `pip install torch onnx onnxscript` y `python slm/entrenar.py` (GPU recomendada; Colab sirve; SLM_EPOCAS, SLM_D, SLM_L).
4. Copiar `slm/modelo.onnx` y `slm/vocab.json` junto al bot, `npm i onnxruntime-node`. El bot lo carga solo.
Vars: IA_SLM=0 apaga, IA_SLM_P (prob. base, default 0.3; se ajusta sola segun el resultado de sus frases vs LLM).
Si npm i onnxruntime-node falla en el postinstall: npm i onnxruntime-node --ignore-scripts
Preentrenamiento: poner texto en espanol (libros, .txt) en `slm/preentrenar/`. entrenar.py primero aprende el idioma con eso (SLM_PRE_PASOS, default 4000) y despues ajusta con tus frases. Sin esa carpeta entrena como antes.
BPE (mejor que letra por letra): `py slm\entrenar_bpe.py` en vez de `entrenar.py`. Aprende un tokenizador BPE propio de tu corpus y libros (SLM_MERGES, default 1500), con prefijos como tokens especiales y ctx 128 tokens. Mismas variables que entrenar.py. slm.js carga ambos formatos solo.

Chat por texto (entrada->salida): `npm run chat`. Modelo propio en slm/chat (entrenar_chat.py).
1. `python slm/bajar_texto.py` (texto espanol de GitHub + lexico.json), `python slm/dialogo.py` (genera slm/chat_dataset.jsonl desde slm/dialogo_base.json).
2. `cd slm && SLM_D=256 SLM_L=6 SLM_PRE_PASOS=4000 SLM_EPOCAS=15 python entrenar_chat.py` (GPU/Colab). Escribe slm/chat/modelo.onnx y vocab.json.
Mejorar comprension: agregar plantillas en dialogo_base.json (categorias "u" entradas, "r" respuestas "estilo|texto", huecos {X} {E} {N} que se copian) y reentrenar. AM_DEBUG=1 muestra estilo y rasgos; AM_BIBLIOTECA=1 usa solo recuperacion.

## 3.000.93 conceptos
slm/conceptos/*.txt (337 conceptos: quimica, fisica, biologia, mate, cosmos, computo, juego) + remates.txt. Formato: "@ termino | alias", "- hecho", "+ e|respuesta completa". conceptos.py genera pares de la intencion definicion (slot X, X2 para diferencias, "y X?" con turno previo). SLM_CONCEPTOS=30 filas por concepto. Test held-out: modo conc en chat_test.jsonl. Requiere reentrenar en Colab y reinstalar clf.*.

## 3.000.94 elementos
slm/elementos.py: los 118 elementos desde una tabla (simbolo, numero atomico, masa, familia, estado) generan miles de preguntas distintas (nombre, simbolo, numero, protones, familia) con respuestas en palabras, sin digitos. Es generador de datos, no consulta en runtime: el saber queda en los pesos. SLM_ELEMENTOS=30 filas por elemento.

## 3.000.95 depuracion
index.js: respuestas del SLM hasta 235 chars (antes 170 cortaba la definicion a la primera frase). slm_chat.js: generacion hasta 100 tokens (antes 70 truncaba). Dataset: respuestas definicion <=235 chars, plural solo en vocal. competencias.js: no calcula si la expresion es una parte pequena del mensaje sin pista de calculo, ignora numeros pegados a letras, rechaza resultados >=1e15, usa el mensaje completo (no solo la ultima clausula).

## 3.000.96 velocidad
slm_chat.js: muestreo top-k por insercion con mascara (0.94 ms -> 0.02 ms por paso), copia de cache KV con slice (0.3 -> 0.08 ms), mascara de tokens prohibidos cacheada, aborto temprano de la generacion si aparece una palabra no permitida (antes generaba todo y luego rechazaba, hasta 6 veces). leer(): si el clasificador tiene conf>=0.9 (IA_RAPIDO_CONF) y la intencion no tiene slots (chat/slots.json, lo escribe dialogo.py) se salta la decodificacion del SLM. IA_RAPIDO=0 lo desactiva. Paso ONNX medido en CPU de 2 nucleos: 1.8 ms con cache (kv q8), asi que el sobrecosto JS era ~45% del paso.

## 3.000.97
competencias.js se evalua antes de leer con el SLM (charla.js y api_am.js): "3+2" responde al instante, sin cargar ni decodificar el modelo.

## 3.000.98 reaccion y deltas
index.js: la esquiva de flechas ahora tambien corre en cada entityMoved de una flecha a menos de 8 bloques (antes solo sondeo cada 200 ms; una flecha recorre ~12 bloques en ese tiempo). Gapple y comida de emergencia se disparan al instante cuando baja la vida (evento health), ademas del sondeo. persist.js: el gist solo recibe los archivos que cambiaron (huella md5 por archivo, antes enviaba todos si cambiaba uno; al arrancar registra la huella de lo restaurado). nn.js: datos_nn.json solo se reescribe si hay episodios nuevos (y cada 10 guardados por seguridad); los pesos se guardan con 8 cifras significativas en vez de 17.

## 3.000.99 competencias por el SLM
Las competencias ya no esquivan al SLM. Intenciones nuevas calculo, ecuacion, ph_calc, masa_molar (slot X = la expresion, formula o ecuacion tal como la escribio el usuario). El SLM lee la peticion; competencias.calcular(intencion, texto, X) calcula el valor exacto (con X y, si falla, con el mensaje entero); el valor entra como hecho <F> (resultado, balanceada, ph, masa) y el SLM lo dice con la voz de AM. slm_chat rechaza la salida si no contiene el valor exacto; si tras 6 intentos no hay respuesta valida se usa la plantilla fija (CP.formatear). Mientras el modelo desplegado no conozca esas intenciones (chat.conoce), se mantiene el atajo por plantilla de 3.000.97. slm/comp_gen.py genera los datos (puerto exacto a Python de la calculadora, el balanceo, pH y masa molar); test/comp_ref.json (170 casos) verifica en JS la paridad con Python. Limites de entrenamiento y generacion: lectura hasta 48 tokens (antes 30), hechos hasta 40 (antes 24), lectura generada hasta 56 pasos (antes 40). SLM_COMP=400 filas por intencion. Requiere reentrenar en Colab.

### sividi toile v3.000.100
- Hechos del mundo: intents `mi_equipo`, `peligro_cerca`, `clima` (slm/mundo_ds.py, SLM_MUNDO=500), claves armadura/mobs/clima desde charla.hechos().
- `rendicion` con respuestas "te dejo ir"; suelta.js agenda la emboscada tras esas palabras.
- escenas.js: escena bravata (cita lo que dijiste contra tu situación).
- Requiere una segunda corrida de Colab.

### sividi toile v3.000.101
- Modelo reentrenado (Colab, base 3.000.99: conceptos, elementos, competencias). Sin mundo_ds ni "te dejo ir": falta segunda corrida.
- clf_ref.json regenerado.

### sividi toile v3.000.102
- 84 conceptos nuevos (juego2, quimica2, mate2, general), 11 plantillas de pregunta, 22 remates.

### sividi toile v3.000.103
- Conceptos: 337 -> 576 (cuerpo, biologia2, fisica2, historia, geografia, tecnologia, lengua, minecraft3, general); duplicados eliminados.

### sividi toile v3.000.104
- Conceptos 665: lore de AM (los cinco, Ted, Ellen, Nimdok, la historia) y extra (psicologia, economia, mitos, medicina, geometria).

### sividi toile v3.000.105
- Conceptos 821: animales, comida, salud, espacio, arte, IA y ficcion, emociones, mapas, Minecraft avanzado. slm/dedup.py para fusionar sin duplicados.

### sividi toile v3.000.106
- Conceptos 922: quimica de compuestos, unidades, cientificos, matematicas. Elementos solo desde elementos.py (sin duplicados). Dataset completo verificado (generacion sin errores).

### sividi toile v3.000.107
- Competencias nuevas: despeje (ecuaciones de primer y segundo grado) y conversion (longitud, masa, volumen, tiempo, temperatura), con paridad Python/JS (250 casos).
- referencia.js: "y eso?", "para que sirve", "otra vez" reutilizan el ultimo concepto. suelta.traicion: respuesta a "me mentiste" tras un "te dejo ir".
- 175 conceptos de Minecraft (recetas, estrategia, comercio). Conceptos: 1097.
- SLM_CONCEPTOS baja a 22 por concepto para que definicion no pase del 25% de los datos.
- slm/kaggle_grande.ipynb: mismo entrenamiento para Kaggle (internet y GPU T4 activados); sale en /kaggle/working/salida/parte_*.

### sividi toile v3.000.108
- Modelo reentrenado en Kaggle (T4, 88792 pares, 76 categorias, 1097 conceptos). Medido: 87 de 100 conceptos al azar con la respuesta correcta; 11 mezclan datos; 2 sin respuesta valida.
- Fallos conocidos: alias tipo pregunta del lore (cuentame tu historia, quien es Ted), "que es la entropia", conceptos cortos (botas, reloj).

### sividi toile v3.000.109
- abasto.buscarVar: en Render el radio de busqueda de bloques sube como maximo a 32 y, tras una busqueda de mas de 250 ms, se pausa cuatro veces ese tiempo. Con 0.1 CPU las busquedas de 3-4 s bloqueaban el servidor y el chat daba timeout.

### sividi toile v3.000.110
- abasto.buscarVar guarda la posicion del ultimo bloque hallado por recurso y la reutiliza sin buscar mientras siga valida.
- MODO=api: solo la API y el chat, sin bot de Minecraft ni autoping. Requiere AM_KEYS.
- Las variables de ecuaciones ("x = 2") ya no se capitalizan.

### sividi toile v3.000.111
- Pausa de busquedas compartida: tras un findBlock de mas de 250 ms, bloqueN, buscarVar y el escaneo de mapa se saltan busquedas por tres veces ese tiempo.
- En Render findBlock se limita a 24 bloques.
