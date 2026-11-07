const assert = require('assert');
const http = require('http');
const express = require('express');
const api = require('../api_am');
const k = api.generarClave('hatred');
assert(api.FORMA.test(k) && k.endsWith('-hatred') && k.length === 'AM--hatred'.length + 12);
assert(api.SUFIJOS.includes(api.generarClave().split('-')[2]));
process.env.AM_KEYS = api.hash(k) + ',zz';
assert(api.clavePermitida(k));
assert(!api.clavePermitida(k.replace(/.$/, 'x')) || k.endsWith('x'));
assert(!api.clavePermitida('AM-aaaaaaaaaaaa-hatred'));
assert(!api.clavePermitida('sk-123'));
let n = 0;
const chat = { listo: () => true, leer: async (t) => ({ intencion: 'saludo', slots: {}, dudoso: false }), responder: async (t, i) => (++n % 2 ? null : 'Hola, hola. ' + t) };
const app = express();
api.montar(app, express, { chat });
const vistos = [];
const chat2 = { listo: () => true, conoce: (i) => i === 'calculo', leer: async () => ({ intencion: 'calculo', slots: { X: '30 + 31' }, dudoso: false }), responder: async (t, i) => { vistos.push(i.hechos); return i.hechos.resultado === '61' ? 'Son 61. Ni eso te salva.' : null; } };
const app2 = express();
api.montar(app2, express, { chat: chat2 });
const srv2 = app2.listen(0, async () => {
  try {
    const r = await fetch('http://127.0.0.1:' + srv2.address().port + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, body: JSON.stringify({ messages: [{ role: 'user', content: 'cuanto es 30 + 31' }] }) }).then((x) => x.json());
    assert.strictEqual(vistos[0].resultado, '61');
    assert(/61/.test(r.choices[0].message.content));
    assert.strictEqual(r.am.lectura.intencion, 'calculo');
    console.log('api slm competencias ok');
  } catch (e) { console.error(e); process.exit(1); } finally { srv2.close(); }
});
const srv = app.listen(0, async () => {
  const p = srv.address().port;
  const f = (ruta, o) => fetch('http://127.0.0.1:' + p + ruta, o).then(async (r) => ({ s: r.status, j: await r.text().then((x) => { try { return JSON.parse(x); } catch (e) { return x; } }) }));
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k };
  const cuerpo = JSON.stringify({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'hola am' }] });
  try {
    assert.strictEqual((await f('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo })).s, 401);
    const r = await f('/v1/chat/completions', { method: 'POST', headers: H, body: cuerpo });
    assert.strictEqual(r.s, 200);
    assert.strictEqual(r.j.choices[0].message.content, 'Hola, hola. hola am');
    assert.strictEqual(r.j.am.intentos, 2);
    const rc = await f('/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ messages: [{ role: 'user', content: '3+2' }] }) });
    assert(/\b5\b/.test(rc.j.choices[0].message.content), rc.j.choices[0].message.content);
    assert.strictEqual(rc.j.am.intentos, 1);
    assert.strictEqual((await f('/v1/chat/completions', { method: 'POST', headers: H, body: '{"messages":[]}' })).s, 400);
    const sse = await fetch('http://127.0.0.1:' + p + '/v1/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'x' }] }) }).then((x) => x.text());
    assert(sse.includes('[DONE]') && sse.includes('chat.completion.chunk'));
    assert.strictEqual((await f('/v1/models', { headers: H })).j.data[0].id, 'am-slm');
    const s = (await f('/v1/salud')).j;
    assert.strictEqual(s.slm, 'ok'); assert(s.ok >= 2);
    assert((await f('/chat')).j.includes('API key'));
    console.log('api ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
  srv.close();
});
