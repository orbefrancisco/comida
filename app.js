// App Comida: registro de lo que comes (texto, código de barras, foto), proteína diaria, agua y horarios,
// plan semanal (recetas del Plan de comidas) y cruce con el Reloj anómalo (misma dirección web = mismo almacenamiento).
const KEY = 'comida-v1', KEY_RELOJ = 'reloj-anomalo-sesiones', VASO_ML = 250, VENTANA_POST_H = 4;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const r1 = x => Math.round(x * 10) / 10;
const fmtN = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const pad = n => String(n).padStart(2, '0');
const diaKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hora = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COMIDAS = [['desayuno', 'Desayuno'], ['almuerzo', 'Almuerzo'], ['cena', 'Cena']];
const ETIQ = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena' };
const comidaPorHora = t => { const h = new Date(t).getHours(); return h < 11 ? 'desayuno' : h < 15 ? 'almuerzo' : h < 18 ? 'merienda' : 'cena'; };
const idxHoy = () => (new Date().getDay() + 6) % 7;

/* ---------- estado ---------- */
// Campos nuevos (v7): pesos {"YYYY-MM-DD": kg} (lo lee también el Reloj anómalo), favs [comidas favoritas],
// sup {items, hecho: {día: {id: true | id de la comida}}}, precios {"ing:clave" | "ali:id": RD$}, cfg.rec (recordatorios).
const recInicial = () => ({ agua: true, aguaCada: 2, desde: 8, hasta: 20, post: true, creatinaHora: '08:00', horas: {} });
const supInicial = () => ({ items: [
  { id: 'creatina', n: 'Creatina', dosis: '5 g', activo: true },
  { id: 'batida', n: 'Batida de proteína', dosis: '1 scoop', activo: true, gScoop: 24, kScoop: 120, scoops: 1 }
], hecho: {} });
function nuevo() {
  return { cfg: { peso: null, factor: 1.8, aguaMeta: 8, mant: null, objetivo: 'mantener', rec: recInicial() }, logs: [], agua: {}, plan: PLAN_INICIAL.map(d => d.slice()), checked: {}, mis: [],
    pesos: {}, favs: [], sup: supInicial(), precios: {} };
}
const esObj = x => x && typeof x === 'object' && !Array.isArray(x);
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !Array.isArray(S.logs)) S = nuevo();
S = Object.assign(nuevo(), S, { cfg: Object.assign(nuevo().cfg, S.cfg || {}) });
// Migración de estados viejos (sin pesos, favoritas, suplementos, precios ni recordatorios).
S.cfg.rec = Object.assign(recInicial(), esObj(S.cfg.rec) ? S.cfg.rec : {});
if (!esObj(S.cfg.rec.horas)) S.cfg.rec.horas = {};
if (!esObj(S.pesos)) S.pesos = {};
if (!Array.isArray(S.favs)) S.favs = [];
if (!esObj(S.sup) || !Array.isArray(S.sup.items)) S.sup = supInicial();
if (!esObj(S.sup.hecho)) S.sup.hecho = {};
if (!esObj(S.precios)) S.precios = {};
function guardar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { aviso('No se pudo guardar en este dispositivo.'); } }

let tab = 'hoy', borrarPend = null, mostrarLista = false, draftExtra = [], draftOverride = {}, fotoDraft = null;
let mostrarPrecios = false, rangoPeso = 30, editarBien = false, sugCache = [];

// Día de entreno: la meta de proteína sube con las series efectivas del Reloj (+0,1 g/kg por cada 8, hasta +0,3, sin pasar de 2,2 g/kg).
const efDia = dk => sesionesReloj().filter(s => diaKey(Date.parse(s.start)) === dk).reduce((a, s) => a + (+s.efectivas || 0), 0);
const factorDia = dk => Math.max(S.cfg.factor, Math.min(2.2, S.cfg.factor + Math.min(.3, Math.round(efDia(dk) / 8) * .1)));
const meta = dk => S.cfg.peso ? Math.round(S.cfg.peso * (dk ? factorDia(dk) : S.cfg.factor)) : null;
const sesionesReloj = () => { try { return JSON.parse(localStorage.getItem(KEY_RELOJ) || '[]').filter(s => s && s.start); } catch (e) { return []; } };
const logsDe = dk => S.logs.filter(l => diaKey(l.t) === dk).sort((a, b) => a.t - b.t);
const protDe = dk => logsDe(dk).reduce((a, l) => a + (l.p || 0), 0);
const kcalDe = dk => logsDe(dk).reduce((a, l) => a + (l.k || 0), 0);

/* ---------- combustible frente al entreno ----------
   Sesión (del Reloj anómalo): duración ≈ descansos + 3 s por rep + isometrías.
   Intensidad I ∈ [0,1] = ½·(congestión media / 0,7) + ½·(tiempo bajo congestión / duración).
   MET de pesas = 3,5 + 2,5·I (Compendium: 3,5 ligero … 6 vigoroso); gasto neto = (MET − 1)·peso·horas.
   Necesidad del día = mantenimiento·(objetivo) + gasto neto de las sesiones. */
const OBJ = { ganar: { f: 1.1, n: 'Ganar músculo (+10 %)' }, mantener: { f: 1, n: 'Mantener' }, bajar: { f: .85, n: 'Bajar grasa (−15 %)' } };
const POST_GKG = .3, PRE_H = 4, JUNTAR_MIN = 60;   // sesiones a menos de 60 min entre sí = un mismo entrenamiento
const mantenimiento = () => S.cfg.mant || (S.cfg.peso ? Math.round(S.cfg.peso * 31 / 10) * 10 : null);
function analizarSesion(s) {
  const sets = s.sets || [];
  let dur = 0, Ps = [];
  sets.forEach(r => {
    const n = parseInt(r.reps, 10) || 0, hold = r.rir === '—';
    dur += (r.rest || 0) + (hold ? n : n * 3);
    if (r.P != null) Ps.push(+r.P);
  });
  if (!sets.length) dur = (s.series || 0) * 90;
  dur = Math.max(dur, 60);
  const Pm = Ps.length ? Ps.reduce((a, b) => a + b, 0) / Ps.length : .5;
  const I = Math.max(0, Math.min(1, .5 * Math.min(1, Pm / .7) + .5 * Math.min(1, (s.tuc || 0) / dur)));
  const met = 3.5 + 2.5 * I, peso = S.cfg.peso || 70;
  const t0 = Date.parse(s.start);
  return { s, t0, fin: t0 + dur * 1000, dur, I, met, kcal: Math.round((met - 1) * peso * dur / 3600),
    nivel: I < .4 ? 'suave' : I < .7 ? 'moderada' : 'fuerte' };
}
const sesionesDe = dk => sesionesReloj().filter(s => diaKey(Date.parse(s.start)) === dk).map(analizarSesion).sort((a, b) => a.t0 - b.t0);
// El reloj guarda una sesión por grupo muscular; varias seguidas (huecos de menos de JUNTAR_MIN) forman un solo entrenamiento.
function entrenamientosDe(dk) {
  const out = [];
  for (const x of sesionesDe(dk)) {
    const u = out[out.length - 1];
    if (u && x.t0 - u.fin <= JUNTAR_MIN * 60e3) u.partes.push(x);
    else out.push({ partes: [x] });
    const e = out[out.length - 1];
    e.fin = Math.max(e.fin || 0, x.fin);
  }
  return out.map(e => {
    const P = e.partes, dur = P.reduce((a, x) => a + x.dur, 0), I = P.reduce((a, x) => a + x.I*x.dur, 0)/dur;
    const grupos = [...new Set(P.map(x => x.s.grupo))];
    return { partes: P, t0: P[0].t0, fin: e.fin, dur, I, kcal: P.reduce((a, x) => a + x.kcal, 0),
      series: P.reduce((a, x) => a + (+x.s.series || 0), 0), grupos,
      nivel: I < .4 ? 'suave' : I < .7 ? 'moderada' : 'fuerte' };
  });
}
function necesidad(dk) {
  const M = mantenimiento(); if (!M) return null;
  const ent = sesionesDe(dk).reduce((a, x) => a + x.kcal, 0);
  return { base: Math.round(M * OBJ[S.cfg.objetivo].f), ent, total: Math.round(M * OBJ[S.cfg.objetivo].f) + ent };
}
// Fracción del día que ya "debería" estar comida: lineal de 7:00 a 21:00.
const fraccionEsperada = t => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60; return Math.max(.15, Math.min(1, (h - 7) / 14)); };
function estadoEnergia(dk, ahora) {
  const nec = necesidad(dk); if (!nec) return null;
  const comido = kcalDe(dk), esHoy = dk === diaKey(ahora), frac = esHoy ? fraccionEsperada(ahora) : 1;
  const esperado = nec.total * frac, r = esperado ? comido / esperado : 1;
  return { nec, comido, esperado: Math.round(esperado), r, falta: Math.max(0, Math.round(nec.total - comido)),
    est: r >= .9 ? 'ok' : r >= .75 ? 'atencion' : 'deficit' };
}
function chequeosEntreno(dk) {
  const ls = logsDe(dk), peso = S.cfg.peso || 70;
  return entrenamientosDe(dk).map(x => {
    const antes = S.logs.filter(l => l.t <= x.t0).sort((a, b) => b.t - a.t)[0];
    const hAntes = antes ? (x.t0 - antes.t) / 3600e3 : null;
    const post = ls.filter(l => l.t >= x.t0 && l.t <= x.fin + VENTANA_POST_H * 3600e3).reduce((a, l) => a + l.p, 0);
    const postMeta = Math.round(POST_GKG * peso), abierta = Date.now() < x.fin + VENTANA_POST_H * 3600e3;
    return { x, hAntes, pre: hAntes != null && hAntes <= PRE_H, post: Math.round(post), postMeta, postOk: post >= postMeta, abierta };
  });
}
// Sugerencias para cubrir lo que falta (proteína, kcal): la que mejor se acerca a ambas.
const OPCIONES = [
  ['Batida: 1 scoop de proteína + 1 vaso de leche + 1 guineo', 33, 373],
  ['Yogur griego + 1 taza de avena', 27, 400],
  ['2 huevos + 1 pan de agua + 1 guineo', 18, 413],
  ['Pechuga a la plancha + 1 taza de arroz', 51, 456],
  ['La bandera', 41, 825],
  ['Atún en lata + 3 casabes', 32, 470],
  ['1 scoop de proteína con agua', 23, 114],
  ['Puñado de maní + 1 guineo', 9, 278]
];
function sugerir(pFalta, kFalta) {
  if (pFalta <= 0 && kFalta <= 0) return null;
  let mejor = null, d = Infinity;
  OPCIONES.forEach(o => {
    const e = Math.abs((o[1] - Math.max(0, pFalta)) / 30) + Math.abs((o[2] - Math.max(0, kFalta)) / 500);
    if (e < d) { d = e; mejor = o; }
  });
  return mejor;
}

/* ---------- lectura de texto ---------- */
const NUMS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: .5, media: .5 };
const UALIAS = {};
for (const u in UNIDADES) UNIDADES[u].alias.forEach(a => { UALIAS[norm(a)] = u; });
const RELLENO = new Set(['comi', 'me', 'tome', 'desayune', 'almorce', 'cene', 'meriende', 'hoy', 'de', 'del', 'un', 'una', 'poco', 'poquito']);
const todos = () => S.mis.concat(ALIMENTOS);

function numero(tok) {
  if (tok == null) return null;
  if (/^\d+\/\d+$/.test(tok)) { const [a, b] = tok.split('/').map(Number); return b ? a / b : null; }
  if (/^\d+([.,]\d+)?$/.test(tok)) return parseFloat(tok.replace(',', '.'));
  return NUMS[tok] ?? null;
}
function buscar(texto) {
  const t = ' ' + texto + ' ', t2 = ' ' + texto.split(' ').map(w => w.replace(/(es|s)$/, '')).join(' ') + ' ';
  let mejor = null, largo = 0;
  for (const f of todos()) for (const a0 of f.a) {
    const a = norm(a0);
    if ((t.includes(' ' + a + ' ') || t2.includes(' ' + a + ' ')) && a.length > largo) { mejor = f; largo = a.length; }
  }
  return mejor;
}
// Nombres de platos que llevan números ("los tres golpes", "siete carnes"): se reconocen antes de leer cantidades.
const conNumero = a => norm(a).split(' ').some(w => NUMS[w] != null);
function leerSegmento(seg) {
  let s = ' ' + norm(seg).replace(/[()]/g, ' ') + ' ', fijo = null, largoFijo = 0;
  for (const f of todos()) for (const a0 of f.a) {
    const a = norm(a0);
    if (conNumero(a) && s.includes(' ' + a + ' ') && a.length > largoFijo) { fijo = f; largoFijo = a.length; }
  }
  if (fijo) for (const a0 of fijo.a) { const a = norm(a0); if (conNumero(a)) s = s.replace(' ' + a + ' ', ' '); }
  let toks = s.split(' ').filter(Boolean);
  let q = null, u = null, gramos = null;
  // "taza y media", "2 tazas y media"
  for (let j = 0; j < toks.length - 2; j++) {
    if (UALIAS[toks[j]] && toks[j + 1] === 'y' && (toks[j + 2] === 'media' || toks[j + 2] === 'medio')) {
      const n = j > 0 ? numero(toks[j - 1]) : null;
      q = (n != null && n >= 1 ? n : 1) + .5; u = UALIAS[toks[j]];
      toks.splice(n != null && n >= 1 ? j - 1 : j, n != null && n >= 1 ? 4 : 3); break;
    }
  }
  // número + peso en cualquier lugar ("pechuga 150 g", "6 onzas de bistec")
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i].match(/^(\d+(?:[.,]\d+)?)(g|gr|kg|oz|lb)$/);
    if (m) { toks.splice(i, 1, m[1], m[2]); }
    const n = numero(toks[i]), nx = toks[i + 1];
    if (n != null && nx && (UALIAS[nx] === 'g' || PESOS[nx])) {
      gramos = n * (PESOS[nx] || 1); q = n; u = UALIAS[nx] === 'g' ? 'g' : nx; toks.splice(i, 2); break;
    }
  }
  if (gramos == null && q == null) {
    for (let i = 0; i < toks.length; i++) {
      const n = numero(toks[i]);
      if (n == null) continue;
      q = n; toks.splice(i, 1);
      if (UALIAS[toks[i]]) { u = UALIAS[toks[i]]; toks.splice(i, 1); }
      if (toks[i] === 'y' && (toks[i + 1] === 'media' || toks[i + 1] === 'medio')) { q += .5; toks.splice(i, 2); }
      break;
    }
    if (u == null) { const j = toks.findIndex(w => UALIAS[w]); if (j >= 0) { u = UALIAS[toks[j]]; toks.splice(j, 1); } }
  }
  while (toks.length && RELLENO.has(toks[0])) toks.shift();
  const texto = toks.join(' ');
  const f = fijo || buscar(texto);
  return calcular({ txt: seg.trim(), f, q: q ?? 1, u, gramos });
}
function calcular(it) {
  const f = it.f;
  if (!f) return Object.assign(it, { g: 0, p: it.pManual || 0, k: 0 });
  let unidad = it.u, g;
  if (it.gramos != null) g = it.gramos;
  else {
    if (!unidad || unidad === 'g' || !f.u[unidad]) unidad = unidad === 'g' ? 'g' : f.d;
    g = unidad === 'g' ? it.q : it.q * f.u[unidad];
  }
  return Object.assign(it, { u: it.gramos != null ? it.u : unidad, g, p: r1(g * f.p / 100), k: Math.round(g * f.k / 100) });
}
function leerTexto(txt) {
  return String(txt || '').split(/,|;|\n|\+| y (?![a-z]*media\b)/i).map(s => s.trim()).filter(s => s.length > 1).map(leerSegmento);
}
function cantidadTxt(it) {
  if (!it.f) return '';
  if (it.gramos != null) return `${fmtN(it.q)} ${it.u === 'g' ? 'g' : it.u}`;
  if (it.u === 'g') return `${Math.round(it.g)} g`;
  const U = UNIDADES[it.u];
  return `${fmtN(it.q)} ${it.q <= 1 ? U.s : U.pl} · ${Math.round(it.g)} g`;
}

/* ---------- fotos (IndexedDB, solo en este dispositivo) ---------- */
let dbP = null;
function idb() {
  if (!dbP) dbP = new Promise((res, rej) => { const r = indexedDB.open('comida-fotos', 1); r.onupgradeneeded = () => r.result.createObjectStore('fotos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbP;
}
async function fotoPut(id, blob) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('fotos', 'readwrite'); tx.objectStore('fotos').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function fotoGet(id) { const db = await idb(); return new Promise(res => { const q = db.transaction('fotos').objectStore('fotos').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function fotoDel(id) { try { const db = await idb(); db.transaction('fotos', 'readwrite').objectStore('fotos').delete(id); } catch (e) {} }
function reducir(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const m = 720, s = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('foto')), 'image/jpeg', .72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('foto')); };
    img.src = url;
  });
}
const urlsFoto = {};
async function pintarFotos() {
  for (const el of document.querySelectorAll('img[data-foto]')) {
    const id = el.dataset.foto;
    if (!urlsFoto[id]) { const b = await fotoGet(id); if (!b) continue; urlsFoto[id] = URL.createObjectURL(b); }
    el.src = urlsFoto[id];
  }
}

/* ---------- plan semanal ---------- */
const receta = (m, nombre) => (RECETAS[m] || []).find(r => r[0] === nombre);
function nutReceta(r) {
  let p = 0, k = 0;
  for (const i in r[1]) { const I = ING[i]; p += r[1][i] * I[3]; k += r[1][i] * I[4]; }
  return { p: Math.round(p), k: Math.round(k) };
}
function fmtCompra(q, u) {
  if (u === 'g') { const lb = q / 453.6; return lb >= .25 ? `${fmtN(Math.round(lb * 4) / 4)} lb` : `${Math.round(q)} g`; }
  if (u === 'ml') return q >= 1000 ? `${fmtN(q / 1000)} L` : `${Math.round(q / 10) * 10} ml`;
  return `${Math.ceil(q - .05)} ud`;
}
function totalesCompra() {
  const t = {};
  S.plan.forEach(d => d.forEach((n, i) => { const r = n && receta(COMIDAS[i][0], n); if (r) for (const k in r[1]) t[k] = (t[k] || 0) + r[1][k]; }));
  return t;
}
const CAT = ['Carnes', 'Víveres', 'Frutas y verduras', 'Lácteos y huevos', 'Granos y despensa'];
function textoCompra() {
  const t = totalesCompra();
  return CAT.map(c => { const it = Object.keys(t).filter(k => ING[k][1] === c && !S.checked[k]); return it.length ? c.toUpperCase() + '\n' + it.map(k => `- ${ING[k][0]}: ${fmtCompra(t[k], ING[k][2])}`).join('\n') : ''; }).filter(Boolean).join('\n\n');
}

/* ---------- costo en pesos (RD$) ----------
   Precio del usuario (S.precios) o el aproximado de datos.js; si no hay ninguno, el costo es desconocido ("—"). */
const precioIng = k => S.precios['ing:' + k] ?? (PRECIO_ING[k] ?? null);
const precioAli = id => S.precios['ali:' + id] ?? (PRECIO_ALI[id] ?? null);
const UNID_ING = { g: 'lb', ml: 'litro', ud: 'unidad' };
function costoIngQ(k, q) {
  const pr = precioIng(k); if (pr == null || !ING[k]) return null;
  const u = ING[k][2];
  return u === 'g' ? q * pr / 453.6 : u === 'ml' ? q * pr / 1000 : q * pr;
}
function costoReceta(r) {
  if (!r) return null;
  let c = 0;
  for (const k in r[1]) { const x = costoIngQ(k, r[1][k]); if (x == null) return null; c += x; }
  return c;
}
const recetaPorNombre = n => { for (const m in RECETAS) { const r = receta(m, n); if (r) return r; } return null; };
function costoItem(i) {
  if (i.id) {
    const f = todos().find(x => x.id === i.id), pr = precioAli(i.id);
    if (!f || pr == null || !i.g || !f.u[f.d]) return null;
    return i.g * pr / f.u[f.d];
  }
  if (i.c === 'del plan') return costoReceta(recetaPorNombre(i.n));
  return null;
}
function costoDia(dk) {
  let c = 0, n = 0, sin = 0;
  logsDe(dk).forEach(l => l.items.forEach(i => { const x = costoItem(i); if (x == null) sin++; else { c += x; n++; } }));
  return { c, n, sin };
}
const rd = x => x == null ? '—' : 'RD$\u00a0' + Math.round(x).toLocaleString('es-DO');
function costoSemanaPlan() {
  let c = 0, sin = 0;
  S.plan.forEach(d => d.forEach((n, i) => { if (!n) return; const x = costoReceta(receta(COMIDAS[i][0], n)); if (x == null) sin++; else c += x; }));
  return { c, sin };
}

/* ---------- peso corporal y tendencia ----------
   Tendencia = media móvil exponencial (α = 0,1) día a día; los días sin pesarse se rellenan por interpolación
   lineal entre pesadas, para que un hueco no congele la tendencia (estilo "peso suavizado").
   Ritmo semanal = pendiente (mínimos cuadrados) de los últimos ≤ 28 días de la serie diaria; es la recta de la
   tendencia sin el retraso propio de la media exponencial. Hace falta una ventana de ≥ 14 días y ≥ 7 pesadas.
   Ajuste de calorías = (ritmo deseado − ritmo real) en kg/semana × 7700 kcal/kg ÷ 7, redondeado a 50 y acotado a ±500;
   cero si el ritmo real ya está dentro del rango del objetivo. */
const ALFA_PESO = .1, KCAL_KG = 7700;
// % del peso por semana según S.cfg.objetivo (mismas claves que OBJ).
const RITMO = { ganar: [.25, .5], mantener: [-.1, .1], bajar: [-1, -.5] };
const fechaDe = dk => { const [y, m, d] = dk.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const diasPeso = () => Object.keys(S.pesos).filter(k => /^\d{4}-\d\d-\d\d$/.test(k) && +S.pesos[k] > 0).sort();
function seriePeso() {
  const ks = diasPeso(), out = []; let tr = null;
  ks.forEach((k, i) => {
    const t0 = fechaDe(k).getTime(), w0 = +S.pesos[k], sig = ks[i + 1];
    const n = sig ? Math.max(1, Math.round((fechaDe(sig).getTime() - t0) / 864e5)) : 1, w1 = sig ? +S.pesos[sig] : w0;
    for (let j = 0; j < n; j++) {
      const wi = w0 + (w1 - w0) * j / n;
      tr = tr == null ? wi : tr + ALFA_PESO * (wi - tr);
      out.push({ dk: diaKey(t0 + j * 864e5), t: t0 + j * 864e5, w: j === 0 ? w0 : null, wi, tr });
    }
  });
  return out;
}
function ritmoPeso() {
  const s = seriePeso();
  if (s.length < 14 || diasPeso().length < 7) return null;
  const u = s.slice(-28), n = u.length, mx = (n - 1) / 2, my = u.reduce((a, x) => a + x.wi, 0) / n;
  let num = 0, den = 0;
  u.forEach((x, i) => { num += (i - mx) * (x.wi - my); den += (i - mx) ** 2; });
  const kgSem = num / den * 7, tr = s[s.length - 1].tr;
  return { kgSem, pctSem: 100 * kgSem / tr, tr, dias: n };
}
function ajusteCalorias() {
  const r = ritmoPeso(); if (!r) return null;
  const [lo, hi] = RITMO[S.cfg.objetivo] || RITMO.mantener, dentro = r.pctSem >= lo && r.pctSem <= hi;
  const desKg = (lo + hi) / 2 / 100 * r.tr, bruto = (desKg - r.kgSem) * KCAL_KG / 7;
  const aj = dentro ? 0 : Math.max(-500, Math.min(500, Math.round(bruto / 50) * 50)) || 0;
  return Object.assign(r, { lo, hi, dentro, desKg, bruto, aj, tope: Math.abs(Math.round(bruto / 50) * 50) > 500 });
}
const fmt2 = x => (Math.round(x * 100) / 100).toString().replace('.', ',');
const signo = x => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt2(Math.abs(x));
function fraseAjuste(a) {
  const pide = `${OBJ[S.cfg.objetivo].n.replace(/ \(.*\)/, '').toLowerCase()} pide ${signo(a.lo)} a ${signo(a.hi)} % por semana`;
  const real = `Tu tendencia ${a.kgSem >= 0 ? 'sube' : 'baja'} ${fmt2(Math.abs(a.kgSem))} kg por semana (${a.pctSem >= 0 ? '+' : '−'}${fmt2(Math.abs(a.pctSem))} %)`;
  if (a.dentro) return `${real}; ${pide}: vas bien, no cambies las calorías.`;
  return `${real}; ${pide} (≈ ${signo(a.desKg)} kg): ${a.aj > 0 ? `come unas <b>${a.aj} kcal más</b>` : `come unas <b>${-a.aj} kcal menos</b>`} al día${a.tope ? ' (tope de 500 para no pasarte)' : ''}.`;
}
function registrarPeso(v) {
  const hoy = diaKey(Date.now());
  S.pesos[hoy] = Math.round(v * 100) / 100;
  const ult = diasPeso().pop(); S.cfg.peso = +S.pesos[ult];
  guardar();
}
function graficaPeso(dias) {
  const s = seriePeso(); if (!s.length) return '';
  const desde = Date.now() - (dias - 1) * 864e5, v = s.filter(x => x.t >= fechaDe(diaKey(desde)).getTime());
  if (!v.length) return `<p class="muted peq">Sin pesadas en los últimos ${dias} días.</p>`;
  const W = 340, H = 190, L = 38, R = 8, T = 10, B = 24, ys = v.flatMap(x => [x.tr, x.w].filter(y => y != null));
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { const c = (hi + lo) / 2; lo = c - .5; hi = c + .5; }
  const pad = (hi - lo) * .1; lo -= pad; hi += pad;
  const t0 = fechaDe(diaKey(desde)).getTime(), t1 = Math.max(v[v.length - 1].t, fechaDe(diaKey(Date.now())).getTime());
  const X = t => L + (W - L - R) * (t - t0) / Math.max(1, t1 - t0), Y = y => T + (H - T - B) * (hi - y) / (hi - lo);
  const fd = t => new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
  let g = '';
  for (let i = 0; i <= 3; i++) { const y = lo + (hi - lo) * i / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" class="gl"/><text x="${L - 6}" y="${(Y(y) + 4).toFixed(1)}" text-anchor="end">${fmtN(y)}</text>`; }
  [t0, (t0 + t1) / 2, t1].forEach((t, i) => { g += `<text x="${X(t).toFixed(1)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${fd(t)}</text>`; });
  const pts = v.map(x => `${X(x.t).toFixed(1)},${Y(x.tr).toFixed(1)}`).join(' ');
  const dots = v.filter(x => x.w != null).map(x => `<circle cx="${X(x.t).toFixed(1)}" cy="${Y(x.w).toFixed(1)}" r="4" class="pd"><title>${fd(x.t)}: ${fmtN(x.w)} kg (tendencia ${fmt2(x.tr)})</title></circle>`).join('');
  return `<div class="graf-peso"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso de los últimos ${dias} días con su tendencia">${g}${dots}<polyline points="${pts}" class="tl"/></svg></div>
    <p class="leyenda-peso peq muted"><span><i class="pd-l"></i>pesada</span><span><i class="tl-l"></i>tendencia (${fmt2(v[v.length - 1].tr)} kg)</span></p>`;
}

/* ---------- qué comer para completar la proteína ----------
   [id de ALIMENTOS, unidad, cantidades posibles, texto(q), 'p' = plato de comida (no antes de las 10 ni después de las 21)] */
const SUG_P = [
  ['huevo', 'ud', [2, 3, 4], q => `${q} huevos`],
  ['atun', 'lata', [1, 2], q => q > 1 ? `${q} latas de atún` : '1 lata de atún'],
  ['pechuga', 'g', [100, 150, 200], q => `${q} g de pechuga`, 'p'],
  ['pollo_guisado', 'porcion', [1], () => '1 porción de pollo guisado', 'p'],
  ['res', 'porcion', [1], () => '1 porción de res guisada', 'p'],
  ['pescado', 'porcion', [1], () => '1 filete de pescado', 'p'],
  ['habichuelas', 'cucharon', [1, 2], q => q > 1 ? `${q} cucharones de habichuelas` : '1 cucharón de habichuelas', 'p'],
  ['whey', 'scoop', [1, 2], q => q > 1 ? `${q} scoops de proteína` : '1 scoop de proteína'],
  ['griego', 'ud', [1, 2], q => q > 1 ? `${q} yogures griegos` : '1 yogur griego'],
  ['leche', 'vaso', [1, 2], q => q > 1 ? `${q} vasos de leche` : '1 vaso de leche'],
  ['queso_freir', 'rebanada', [2, 3], q => `${q} rebanadas de queso de freír`],
  ['salami', 'rebanada', [2, 3], q => `${q} ruedas de salami`],
  ['sardina', 'lata', [1], () => '1 lata de sardinas'],
  ['jamon', 'rebanada', [2, 4], q => `${q} lonjas de jamón`],
  ['clara', 'ud', [3, 4], q => `${q} claras de huevo`],
  ['mani', 'porcion', [1], () => '1 puñado de maní (30 g)']
];
const alimento = id => todos().find(f => f.id === id);
function itemDe(id, u, q) {
  const f = alimento(id), x = calcular({ txt: '', f, q, u, gramos: u === 'g' ? q : null });
  return { id: f.id, n: f.n, c: cantidadTxt(x), g: Math.round(x.g), p: x.p, k: x.k };
}
function sugerenciasProteina(falta, ahora) {
  if (falta < 10) return { obj: falta, combos: [] };
  const h = new Date(ahora).getHours(), obj = Math.min(falta, 80), desde = ahora - 30 * 864e5, frec = {};
  S.logs.forEach(l => { if (l.t >= desde) l.items.forEach(i => { if (i.id) frec[i.id] = (frec[i.id] || 0) + 1; }); });
  const opc = [];
  SUG_P.forEach(([id, u, qs, txt, tipo]) => {
    if (!alimento(id) || (tipo === 'p' && (h < 10 || h >= 21))) return;
    qs.forEach(q => { const it = itemDe(id, u, q); opc.push({ id, u, q, txt: txt(q), p: it.p, k: it.k, plato: tipo === 'p' }); });
  });
  const combos = [], e = S.cfg.peso ? estadoEnergia(diaKey(ahora), ahora) : null, kLibre = e ? e.nec.total - e.comido : null;
  const prueba = c => {
    const p = c.reduce((a, o) => a + o.p, 0), k = c.reduce((a, o) => a + o.k, 0);
    if (Math.abs(p - obj) > 10 || c.filter(o => o.plato).length > 1) return;   // como mucho un plato de comida por sugerencia
    const gusto = c.reduce((a, o) => a + Math.min(1, (frec[o.id] || 0) / 5), 0) / c.length;
    const exceso = kLibre != null ? Math.max(0, k - Math.max(0, kLibre)) / 400 : 0;
    combos.push({ c, p, k, nota: Math.abs(p - obj) / 10 + .6 * c.length - 1.2 * gusto + exceso });
  };
  for (let i = 0; i < opc.length; i++) {
    prueba([opc[i]]);
    for (let j = i + 1; j < opc.length; j++) {
      if (opc[j].id === opc[i].id) continue;
      prueba([opc[i], opc[j]]);
      if (obj > 45) for (let m = j + 1; m < opc.length; m++) if (opc[m].id !== opc[i].id && opc[m].id !== opc[j].id) prueba([opc[i], opc[j], opc[m]]);
    }
  }
  combos.sort((a, b) => a.nota - b.nota);
  const elegidos = [], usados = new Set();
  for (const x of combos) {
    if (x.c.some(o => usados.has(o.id))) continue;   // variedad: cada alimento sale en una sola sugerencia
    elegidos.push(x); x.c.forEach(o => usados.add(o.id));
    if (elegidos.length === 3) break;
  }
  return { obj, combos: elegidos };
}

/* ---------- favoritas y repetir ayer ---------- */
const firma = items => items.map(i => `${i.n}|${i.c || ''}`).join(';');
const descLog = l => l.items.map(i => i.n + (i.c ? ` (${i.c})` : '')).join(', ') || 'Solo foto';
function copiarLog(l, t, comida) {
  const items = l.items.map(i => Object.assign({}, i));
  const x = { id: 'c' + t, t, comida: comida || l.comida, items, p: r1(items.reduce((a, i) => a + (i.p || 0), 0)), k: items.reduce((a, i) => a + (i.k || 0), 0), foto: false, src: 'copia' };
  S.logs.push(x); return x;
}
let ultT = 0;
const nuevoT = () => { ultT = Math.max(Date.now(), ultT + 1); return ultT; };   // ids únicos al anotar varias seguidas

/* ---------- suplementos ---------- */
const supHoy = () => { const hoy = diaKey(Date.now()); return S.sup.hecho[hoy] || (S.sup.hecho[hoy] = {}); };
function supTomado(it, dk) {
  const v = (S.sup.hecho[dk] || {})[it.id];
  if (it.id === 'batida') return !!v && S.logs.some(l => l.id === v);
  return !!v;
}
function rachaCreatina() {
  const c = S.sup.items.find(x => x.id === 'creatina'); if (!c) return 0;
  let n = 0, t = Date.now();
  if (!supTomado(c, diaKey(t))) t -= 864e5;   // si hoy aún no, la racha sigue viva desde ayer
  while (supTomado(c, diaKey(t))) { n++; t -= 864e5; }
  return n;
}
function marcarSup(id) {
  const it = S.sup.items.find(x => x.id === id); if (!it) return;
  const h = supHoy(), hoy = diaKey(Date.now());
  if (supTomado(it, hoy)) {
    if (id === 'batida') S.logs = S.logs.filter(l => l.id !== h[id]);
    delete h[id]; guardar(); return;
  }
  if (id === 'batida') {
    const sc = +it.scoops || 1, t = nuevoT(), p = r1((+it.gScoop || 0) * sc), k = Math.round((+it.kScoop || 0) * sc);
    const log = { id: 'c' + t, t, comida: comidaPorHora(t), items: [{ id: 'whey', n: it.n || 'Batida de proteína', c: `${fmtN(sc)} ${sc <= 1 ? 'scoop' : 'scoops'}`, g: Math.round(30 * sc), p, k }], p, k, foto: false, src: 'sup' };
    S.logs.push(log); h[id] = log.id; aviso(`Batida anotada: ${Math.round(p)} g de proteína.`);
  } else h[id] = true;
  guardar();
}

/* ---------- recuperación del día ----------
   'bienestar-diario' (compartido con el Reloj anómalo) = {"YYYY-MM-DD": {sueno: horas, energia: 1–5, t: ms}};
   el sueño de anoche se guarda con la fecha de hoy.
   Nota 0–100 = promedio ponderado de componentes 0–100; los que no tienen datos se omiten y los pesos se reparten:
     Sueño 40 %: 4 h → 0, 8 h o más → 100 (lineal).
     Energía 15 %: 1 → 0 … 5 → 100.
     Carga de entreno 15 %: series efectivas de ayer + la mitad de las de hoy; ≤ 10 → 100, ≥ 30 → 0.
     Comida de ayer 20 %: mitad proteína (comida ÷ meta, tope 1), mitad calorías (≥ 90 % de lo necesario → 100, ≤ 50 % → 0).
     Agua de ayer 10 %: vasos ÷ meta (tope 1); solo si anotas agua (algún vaso en los últimos 7 días).
   Sin dato de sueño no se da nota (es el componente principal): se piden las horas.
   Semáforo: ≥ 75 verde, 50–74 ámbar, < 50 rojo. La frase explica el componente que más puntos quita. */
const KEY_BIEN = 'bienestar-diario';
const leerBien = () => { try { const o = JSON.parse(localStorage.getItem(KEY_BIEN) || '{}'); return esObj(o) ? o : {}; } catch (e) { return {}; } };
function anotarBien(campo, v) {
  const o = leerBien(), hoy = diaKey(Date.now());
  o[hoy] = Object.assign(esObj(o[hoy]) ? o[hoy] : {}, { [campo]: v, t: Date.now() });
  try { localStorage.setItem(KEY_BIEN, JSON.stringify(o)); } catch (e) { aviso('No se pudo guardar en este dispositivo.'); }
}
const clamp01 = x => Math.max(0, Math.min(1, x));
function recuperacion(ahora) {
  const hoy = diaKey(ahora), ayer = diaKey(ahora - 864e5), b = leerBien()[hoy] || {}, C = [];
  if (b.sueno != null && isFinite(b.sueno)) C.push({ k: 'sueno', n: 'Sueño', w: .40, s: 100 * clamp01((b.sueno - 4) / 4), v: `${fmtN(b.sueno)} h` });
  if (b.energia != null && isFinite(b.energia)) C.push({ k: 'energia', n: 'Energía', w: .15, s: 100 * clamp01((b.energia - 1) / 4), v: `${b.energia} de 5` });
  const ses = sesionesReloj();
  if (ses.some(s => Date.parse(s.start) > ahora - 14 * 864e5)) {
    const ea = efDia(ayer), eh = efDia(hoy), carga = ea + eh / 2;
    C.push({ k: 'entreno', n: 'Carga de entreno', w: .15, s: 100 * clamp01((30 - carga) / 20), v: `${fmtN(ea)} series ayer${eh ? `, ${fmtN(eh)} hoy` : ''}`, ea, eh });
  }
  const lsA = logsDe(ayer), Ma = meta(ayer);
  if (lsA.length && Ma) {
    const pa = protDe(ayer), sp = clamp01(pa / Ma), nec = necesidad(ayer), ka = kcalDe(ayer);
    const sk = nec ? clamp01((ka / nec.total - .5) / .4) : sp;
    C.push({ k: 'comida', n: 'Comida de ayer', w: .20, s: 100 * (sp + sk) / 2, v: `${Math.round(pa)}/${Ma} g · ${ka}${nec ? '/' + nec.total : ''} kcal`, pa, Ma, ka, nec: nec && nec.total });
  }
  const va = S.agua[ayer] || 0, llevaAgua = [1, 2, 3, 4, 5, 6, 7].some(d => S.agua[diaKey(ahora - d * 864e5)] > 0);
  if (llevaAgua) C.push({ k: 'agua', n: 'Agua de ayer', w: .10, s: 100 * clamp01(va / S.cfg.aguaMeta), v: `${va} de ${S.cfg.aguaMeta} vasos`, va });
  if (!C.some(c => c.k === 'sueno')) return { C, b, nota: null };   // sin el sueño (lo que más pesa) no hay nota
  const W = C.reduce((a, c) => a + c.w, 0), nota = Math.round(C.reduce((a, c) => a + c.w * c.s, 0) / W);
  C.forEach(c => { c.pierde = c.w / W * (100 - c.s); });
  const peor = C.slice().sort((a, c) => c.pierde - a.pierde)[0];
  return { C, b, nota, peor, est: nota >= 75 ? 'ok' : nota >= 50 ? 'atencion' : 'deficit' };
}
function consejoRecup(r) {
  const p = r.peor;
  if (!p || p.pierde < 4) return 'Todo en orden: buen día para entrenar fuerte.';
  return {
    sueno: `Lo que más te baja la nota es el sueño (${p.v}): si entrenas, quita una serie por ejercicio y esta noche acuéstate más temprano.`,
    energia: `Tu energía está baja (${p.v}): calienta bien, come algo con carbohidrato antes y no busques récords hoy.`,
    entreno: `Vienes con mucha carga (${p.v}): hoy trabaja otro grupo muscular o descansa.`,
    comida: `Ayer te quedaste corto de comida (${p.v}): hoy adelanta la proteína y no te saltes comidas.`,
    agua: `Ayer tomaste poca agua (${p.v}): empieza hoy con dos vasos.`
  }[p.k];
}

/* ---------- recordatorios ----------
   (a) Con la app abierta: agua cada N horas y proteína después del entreno. Aviso del sistema si hay permiso
       (pedido solo al tocar el botón), y siempre un mensaje en pantalla.
   (b) Calendario: archivo .ics con eventos diarios y alarma (las PWA no pueden programar alarmas fiables). */
const HORA_DEF = { desayuno: '07:30', almuerzo: '12:30', cena: '19:00' };
const aMin = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const deMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
// Hora típica de cada comida: la mediana de lo anotado en los últimos 21 días (redondeada a 15 min), o la que pongas.
function horaComida(c) {
  if (S.cfg.rec.horas[c]) return S.cfg.rec.horas[c];
  const ms = S.logs.filter(l => l.comida === c && l.t > Date.now() - 21 * 864e5).map(l => { const d = new Date(l.t); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  return ms.length >= 3 ? deMin(Math.round(ms[ms.length >> 1] / 15) * 15) : HORA_DEF[c];
}
let ultAvisoAgua = Date.now();
const avisados = new Set();
function avisar(titulo, cuerpo, accion) {
  const box = $('recAviso');
  if (box) {
    box.innerHTML = `<div><b>${esc(titulo)}</b><span>${esc(cuerpo)}</span></div>${accion ? `<button class="prim" data-act="${accion[0]}">${esc(accion[1])}</button>` : ''}<button class="x" data-act="recCerrar" aria-label="Cerrar">×</button>`;
    box.hidden = false;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const op = { body: cuerpo, icon: 'icono-192.png', tag: 'comida-' + titulo };
  const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  (sw ? navigator.serviceWorker.ready.then(r => r.showNotification(titulo, op)) : Promise.reject())
    .catch(() => { try { new Notification(titulo, op); } catch (e) {} });
}
function revisarRecordatorios() {
  const R = S.cfg.rec, ahora = Date.now(), d = new Date(ahora), h = d.getHours() + d.getMinutes() / 60, hoy = diaKey(ahora), v = S.agua[hoy] || 0;
  if (R.agua && h >= R.desde && h < R.hasta && v < S.cfg.aguaMeta && ahora - Math.max(S.aguaT || 0, ultAvisoAgua) >= R.aguaCada * 3600e3) {
    ultAvisoAgua = ahora; avisar('Hora de tomar agua', `Llevas ${v} de ${S.cfg.aguaMeta} vasos hoy.`, ['aguaMas', '+ Vaso']);
  }
  if (R.post && S.cfg.peso) chequeosEntreno(hoy).forEach(c => {
    const k = 'post' + c.x.t0;
    if (c.abierta && !c.postOk && ahora > c.x.fin + 30 * 60e3 && !avisados.has(k)) {
      avisados.add(k); avisar('Proteína después del entreno', `Llevas ${c.post} de ${c.postMeta} g desde que entrenaste; te quedan ${Math.max(0, Math.round((c.x.fin + VENTANA_POST_H * 3600e3 - ahora) / 60e3))} min de ventana.`, ['irAgregar', 'Anotar']);
    }
  });
}
function textoICS() {
  const R = S.cfg.rec, hoy = new Date(), f = `${hoy.getFullYear()}${pad(hoy.getMonth() + 1)}${pad(hoy.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), M = meta();
  const ev = [];
  if (R.agua) for (let m = R.desde * 60; m <= R.hasta * 60; m += R.aguaCada * 60) ev.push(['agua', m, 'Tomar agua', `Un vaso de agua (250 ml). Tu meta: ${S.cfg.aguaMeta} vasos al día.`]);
  COMIDAS.forEach(([c, lab]) => ev.push([c, aMin(horaComida(c)), lab, M ? `Hora de ${lab.toLowerCase()}. Meta de proteína del día: ${M} g.` : `Hora de ${lab.toLowerCase()}.`]));
  const cr = S.sup.items.find(x => x.id === 'creatina' && x.activo);
  if (cr) ev.push(['creatina', aMin(R.creatinaHora), 'Creatina', `Toma ${cr.dosis || '5 g'} de creatina (cualquier hora sirve; lo importante es todos los días).`]);
  const txt = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Comida//Recordatorios//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Comida'];
  ev.forEach(([tipo, m, sum, desc]) => {
    const hm = deMin(m).replace(':', '');
    L.push('BEGIN:VEVENT', `UID:comida-${tipo}-${hm}@comida`, `DTSTAMP:${stamp}`, `DTSTART:${f}T${hm}00`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
      `SUMMARY:${txt(sum)}`, `DESCRIPTION:${txt(desc)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(sum)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  // Líneas de más de 75 bytes se doblan (RFC 5545).
  const enc = new TextEncoder(), doblar = s => { let out = '', n = 0; for (const ch of s) { const b = enc.encode(ch).length; if (n + b > 74) { out += '\r\n '; n = 1; } out += ch; n += b; } return out; };
  return { txt: L.map(doblar).join('\r\n') + '\r\n', n: ev.length };
}

/* ---------- avisos ---------- */
let avisoT = 0;
function aviso(msg) { const el = $('aviso'); el.textContent = msg; el.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- vistas ---------- */
function barra(v, m) { const pc = m ? Math.min(100, 100 * v / m) : 0; return `<div class="track"><div class="fill" style="width:${pc.toFixed(1)}%"></div></div>`; }

function extraEntreno(dk) {
  const e = efDia(dk), f = factorDia(dk);
  if (!e) return '';
  const gr = [...new Set(sesionesReloj().filter(s => diaKey(Date.parse(s.start)) === dk).map(s => String(s.grupo).toLowerCase()))].join(' y ');
  return `<p class="peq">Entrenaste ${esc(gr)}: <b>${fmtN(Math.round(e * 10) / 10)} series efectivas</b>. ${f > S.cfg.factor ? `La meta de hoy sube ${fmtN(Math.round((f - S.cfg.factor) * 10) / 10)} g por kg (+${Math.round((f - S.cfg.factor) * S.cfg.peso)} g).` : f >= 2.2 ? 'Tu meta ya está en el máximo útil (2,2 g por kg).' : 'Con este volumen tu meta normal alcanza.'}</p>`;
}

function vistaHoy() {
  const hoy = diaKey(Date.now()), ls = logsDe(hoy), p = protDe(hoy), M = meta(hoy);
  const ses = sesionesReloj().filter(s => diaKey(Date.parse(s.start)) === hoy);
  const vasos = S.agua[hoy] || 0, vm = S.cfg.aguaMeta;
  const ultima = ls.length ? ls[ls.length - 1].t : null;
  let h = `<p class="fecha">${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>`;
  h += tarjetaRecuperacion();
  h += `<section class="card"><div class="fila"><h2>Proteína</h2><span class="grande">${Math.round(p)}<small> / ${M ?? '—'} g</small></span></div>${barra(p, M)}`;
  h += M ? `<p class="muted">${p >= M ? 'Meta cumplida.' : `Te faltan <b>${Math.round(M - p)} g</b>.`} Meta: ${fmtN(factorDia(hoy))} g por kg × ${fmtN(S.cfg.peso)} kg.</p>${extraEntreno(hoy)}${bloqueCompletar(M - p)}`
    : `<p class="muted">Anota tu peso en la tarjeta de abajo para calcular la meta.</p>`;
  h += `</section>`;
  h += tarjetaPeso() + tarjetaSuplementos();
  h += tarjetaCombustible(hoy, ses.length);
  // agua
  h += `<section class="card"><div class="fila"><h2>Agua</h2><span class="grande">${fmtN(vasos * VASO_ML / 1000)}<small> / ${fmtN(vm * VASO_ML / 1000)} L</small></span></div>
    <div class="vasos" role="group" aria-label="Vasos de agua">`;
  for (let i = 0; i < Math.max(vm, vasos); i++) h += `<button class="vaso${i < vasos ? ' on' : ''}" data-act="vaso" data-i="${i}" aria-label="Vaso ${i + 1}${i < vasos ? ', tomado' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l-1.5 17a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z"/></svg></button>`;
  h += `</div><div class="acc"><button data-act="aguaMenos">− Vaso</button><button class="prim" data-act="aguaMas">+ Vaso (250 ml)</button></div></section>`;
  // horario
  h += `<section class="card"><div class="fila"><h2>Lo que comiste</h2>${ultima ? `<span class="muted">última hace ${hace(ultima)}</span>` : ''}</div>`;
  h += ls.length ? `<ol class="linea">${ls.map(itemLog).join('')}</ol>` : `<p class="muted">Todavía nada hoy. Toca <b>Agregar</b> para anotar, o repite lo de ayer.</p>`;
  if (ls.length) { const c = costoDia(hoy); h += `<p class="peq">Costo de hoy: <b>${c.n ? rd(c.c) : '—'}</b>${c.n && c.sin ? ` <span class="muted">(sin contar ${c.sin} ${c.sin > 1 ? 'cosas' : 'cosa'} sin precio)</span>` : ''} <span class="muted">· precios aproximados</span></p>`; }
  h += `<div class="acc"><button data-act="ir" data-to="ayerCaja">Repetir ayer</button><button data-act="ir" data-to="favCaja">★ Favoritas${S.favs.length ? ` (${S.favs.length})` : ''}</button></div>`;
  h += `<p class="muted peq">Toca la ☆ de una comida para guardarla en favoritas.</p></section>`;
  return h;
}
function tarjetaRecuperacion() {
  const r = recuperacion(Date.now()), b = r.b, faltaS = b.sueno == null || editarBien, faltaE = b.energia == null || editarBien;
  let h = `<section class="card"><div class="fila"><h2>Recuperación</h2>${r.nota != null ? `<span class="grande">${r.nota}<small> / 100</small></span>` : ''}</div>`;
  if (r.nota != null) {
    h += `<div class="fila"><span class="sem ${r.est}">${{ ok: '● Verde: a tope', atencion: '● Ámbar: con cuidado', deficit: '● Rojo: prioriza recuperar' }[r.est]}</span>${!faltaS && !faltaE ? `<button class="chip" data-act="editarBien">Cambiar sueño</button>` : ''}</div>`;
    h += `<p>${consejoRecup(r)}</p><ul class="compo">${r.C.map(c => `<li><span>${c.n}</span><span class="muted peq">${esc(c.v)}</span><div class="track"><div class="fill${c.s < 50 ? ' bajo' : c.s < 75 ? ' medio' : ''}" style="width:${c.s.toFixed(0)}%"></div></div></li>`).join('')}</ul>`;
  } else h += `<p class="muted">Anota cuánto dormiste para ver tu nota de hoy.</p>`;
  if (faltaS) h += `<span class="lbl">¿Cuánto dormiste anoche?</span><div class="chips">${[['<5', 4.5], ['5–6', 5.5], ['6–7', 6.5], ['7–8', 7.5], ['8+', 8.5]].map(([t, v]) => `<button class="chip${b.sueno === v ? ' sel' : ''}" data-act="sueno" data-v="${v}">${t} h</button>`).join('')}</div>`;
  if (faltaE) h += `<span class="lbl">¿Cómo está tu energía? (1 = sin fuerzas, 5 = a tope)</span><div class="chips">${[1, 2, 3, 4, 5].map(v => `<button class="chip${b.energia === v ? ' sel' : ''}" data-act="energia" data-v="${v}">${v}</button>`).join('')}</div>`;
  if (r.nota == null) h += `<p class="muted peq">El sueño es lo que más pesa en la nota; el Reloj anómalo también lo pregunta antes de entrenar.</p>`;
  return h + `</section>`;
}
function bloqueCompletar(falta) {
  sugCache = [];
  if (falta < 10) return '';
  const s = sugerenciasProteina(falta, Date.now());
  if (!s.combos.length) return '';
  sugCache = s.combos;
  return `<div class="sugp"><p class="peq"><b>Para completar${s.obj < falta ? ` ${s.obj} g de los ${Math.round(falta)} que faltan` : ''}:</b> toca una para anotarla.</p>
    ${s.combos.map((x, i) => `<button class="opc" data-act="sugP" data-i="${i}"><span>${esc(x.c.map(o => o.txt).join(' + '))}</span><b>≈ ${Math.round(x.p)} g</b></button>`).join('')}
    ${s.obj < falta ? '<p class="muted peq">Te falta mucho para una sola comida: reparte el resto en la siguiente.</p>' : ''}</div>`;
}
function tarjetaPeso() {
  const hoy = diaKey(Date.now()), ks = diasPeso(), yaHoy = S.pesos[hoy] != null, s = seriePeso(), a = ajusteCalorias();
  const ult = ks.length ? +S.pesos[ks[ks.length - 1]] : S.cfg.peso;
  let h = `<section class="card"><div class="fila"><h2>Peso</h2>${s.length ? `<span class="grande">${fmt2(s[s.length - 1].tr)}<small> kg tendencia</small></span>` : ''}</div>
    <div class="dos"><label class="lbl">${yaHoy ? 'Peso de hoy (guardado)' : 'Peso de esta mañana (kg)'}<input id="pesoHoy" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${ult ?? ''}" placeholder="75"></label>
    <button class="${yaHoy ? '' : 'prim'}" data-act="guardarPeso">${yaHoy ? 'Corregir' : 'Guardar'}</button></div>`;
  if (a) h += `<p class="peq">${fraseAjuste(a)}</p>`;
  else if (ks.length) h += `<p class="muted peq">Pésate cada mañana, en ayunas y después del baño. Con 14 días de datos (llevas ${ks.length} ${ks.length === 1 ? 'pesada' : 'pesadas'}) verás tu ritmo semanal y cuánto ajustar las calorías.</p>`;
  else h += `<p class="muted peq">Pésate en la mañana, en ayunas. La tendencia suaviza los cambios de agua de un día a otro.</p>`;
  if (s.length > 1) h += `<button class="enlace" data-act="verPeso">Ver la gráfica →</button>`;
  return h + `</section>`;
}
function tarjetaSuplementos() {
  const act = S.sup.items.filter(x => x.activo); if (!act.length) return '';
  const hoy = diaKey(Date.now()), racha = rachaCreatina(), cr = act.find(x => x.id === 'creatina');
  let h = `<section class="card"><div class="fila"><h2>Suplementos</h2>${cr ? `<span class="peq">Racha de creatina: <b>${racha} ${racha === 1 ? 'día' : 'días'}</b></span>` : ''}</div><div class="sups">`;
  act.forEach(it => {
    const on = supTomado(it, hoy), extra = it.id === 'batida' ? ` · ${fmtN((+it.gScoop || 0) * (+it.scoops || 1))} g de proteína` : '';
    h += `<button class="sup${on ? ' on' : ''}" data-act="sup" data-id="${esc(it.id)}" aria-pressed="${on}"><span class="ck">${on ? '✓' : ''}</span><span>${esc(it.n)}<small> ${esc(it.dosis || '')}${extra}</small></span></button>`;
  });
  h += `</div>`;
  if (act.some(x => x.id === 'batida')) h += `<p class="muted peq">Marcar la batida la anota como comida y suma su proteína.</p>`;
  return h + `</section>`;
}
const ETQ_EST = { ok: 'Bien', atencion: 'Atención', deficit: 'Déficit' };
function tarjetaCombustible(dk, hayEntreno) {
  let h = `<section class="card"><h2>Combustible vs entreno</h2>`;
  if (!hayEntreno) return h + `<p class="muted">No hay entreno de hoy en el Reloj anómalo. Cuando entrenes, aquí verás si lo que comes alcanza para la intensidad de la sesión.</p></section>`;
  if (!S.cfg.peso) return h + `<p class="muted">Pon tu peso arriba para calcular el gasto del entreno.</p></section>`;
  const ch = chequeosEntreno(dk), e = estadoEnergia(dk, Date.now()), p = protDe(dk), M = meta(dk);
  ch.forEach(c => {
    const x = c.x, detalle = x.partes.length > 1 ? `<p class="muted peq">${x.partes.map(y => `${esc(y.s.grupo)} ${hora(y.t0)} (${Math.round(y.dur / 60)} min)`).join(' · ')}</p>` : '';
    h += `<div class="sesion"><div class="fila"><b>${esc(x.grupos.join(' + '))} · ${hora(x.t0)}–${hora(x.fin)}</b><span class="muted peq">${Math.round(x.dur / 60)} min · ${x.series} series</span></div>
      <div class="fila"><span class="peq">Intensidad <b>${x.nivel}</b></span><span class="peq">≈ <b>${x.kcal} kcal</b> extra</span></div>${barra(x.I, 1)}${detalle}</div>`;
  });
  h += `<div class="fila"><span>Energía de hoy</span><span class="sem ${e.est}">${ETQ_EST[e.est]}</span></div>
    ${barra(e.comido, e.nec.total)}
    <p class="peq">Comiste <b>${e.comido} kcal</b> de <b>${e.nec.total}</b> (mantenimiento ${e.nec.base} + entreno ${e.nec.ent}).
      A esta hora lo esperable son unas ${e.esperado} kcal.</p>`;
  h += `<ul class="checks">`;
  ch.forEach(c => {
    const quien = ch.length > 1 ? ` (entreno de las ${hora(c.x.t0)})` : '';
    h += c.hAntes == null ? `<li class="mal">No hay comida anotada antes de entrenar${quien}.</li>`
      : `<li class="${c.pre ? 'bien' : 'mal'}">${c.pre ? `Comiste ${fmtN(r1(c.hAntes))} h antes de entrenar${quien}.` : `Llegaste al entreno${quien} con ${fmtN(r1(c.hAntes))} h sin comer (lo ideal es menos de ${PRE_H} h).`}</li>`;
    h += `<li class="${c.postOk ? 'bien' : c.abierta ? 'pend' : 'mal'}">Proteína después del entreno${quien}: <b>${c.post} de ${c.postMeta} g</b>${c.postOk ? '.' : c.abierta ? ' · todavía estás a tiempo.' : ' · la ventana ya cerró.'}</li>`;
  });
  if (M) h += `<li class="${p >= M ? 'bien' : 'pend'}">Proteína del día: ${Math.round(p)} de ${M} g.</li>`;
  h += `</ul>`;
  const pF = Math.max(M ? M - p : 0, ...ch.filter(c => c.abierta && !c.postOk).map(c => c.postMeta - c.post));
  const kF = e.est === 'ok' ? 0 : Math.max(0, e.esperado - e.comido);
  const sg = (e.est !== 'ok' || ch.some(c => c.abierta && !c.postOk)) ? sugerir(pF, kF) : null;
  if (sg) h += `<p class="sug">Para cubrirlo: <b>${esc(sg[0])}</b> · ${sg[1]} g de proteína, ${sg[2]} kcal.</p>`;
  return h + `<p class="muted peq">Estimación con los datos del reloj; los valores exactos dependen de tu cuerpo. Las comidas puestas «a mano» no suman calorías.</p></section>`;
}
function hace(t) { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }
function itemLog(l) {
  const fav = l.items.length && S.favs.some(f => f.sig === firma(l.items));
  return `<li><span class="hora">${hora(l.t)}</span><div class="cuerpo"><span class="etq">${ETIQ[l.comida] || ''}</span><span>${esc(descLog(l))}</span>
    ${l.foto ? `<img data-foto="${esc(l.id)}" alt="Foto de la comida" class="mini">` : ''}</div>
    <span class="prot">${Math.round(l.p)} g</span>${l.items.length ? `<button class="x estrella${fav ? ' on' : ''}" data-act="fav" data-id="${esc(l.id)}" aria-pressed="${!!fav}" aria-label="${fav ? 'Quitar de favoritas' : 'Guardar en favoritas'}">${fav ? '★' : '☆'}</button>` : '<span></span>'}<button class="x" data-act="borrar" data-id="${esc(l.id)}" aria-label="Borrar">${borrarPend === l.id ? '¿Borrar?' : '×'}</button></li>`;
}

function itemsDraft() {
  const it = leerTexto($('texto') ? $('texto').value : (vistaHoy.txt || ''));
  it.forEach((x, i) => { const o = draftOverride[i]; if (o && o.f !== undefined) { x.f = o.f; } if (o && o.q != null) { x.q = o.q; x.gramos = x.gramos != null ? o.q * (PESOS[x.u] || 1) : null; } if (o && o.pManual != null) x.pManual = o.pManual; calcular(x); });
  return it.concat(draftExtra);
}
let textoGuardado = '';
function vistaAgregar() {
  const ahora = new Date();
  let h = `<section class="card"><label class="lbl" for="texto">¿Qué comiste?</label>
    <textarea id="texto" rows="3" placeholder="2 huevos, 1 taza de arroz, pechuga 150 g">${esc(textoGuardado)}</textarea>
    <p class="muted peq">Separa con comas. Entiende tazas, cucharones, rebanadas, scoops, gramos, onzas y platos como la bandera.</p>
    <div class="chips">${recientes().map(n => `<button class="chip" data-act="chip" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div id="previa"></div>
    <div class="acc">
      <button data-act="foto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg> Foto</button>
      <button data-act="codigo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M20 5v14"/></svg> Código de barras</button>
    </div>
    <div id="fotoPrevia"></div>
    <div class="dos">
      <label class="lbl">Hora <input id="hora" type="time" value="${pad(ahora.getHours())}:${pad(ahora.getMinutes())}"></label>
      <label class="lbl">Comida <select id="comida">${Object.keys(ETIQ).map(k => `<option value="${k}"${k === comidaPorHora(ahora) ? ' selected' : ''}>${ETIQ[k]}</option>`).join('')}</select></label>
    </div>
    <button class="prim ancho" data-act="guardarComida">Guardar comida</button>
  </section>
  <section class="card" id="codigoCaja" hidden></section>`;
  // Favoritas: se anotan con un toque a la hora actual.
  h += `<section class="card" id="favCaja"><h2>★ Favoritas</h2>`;
  h += S.favs.length ? `<ul class="lista-r">${S.favs.map(f => `<li><div class="cuerpo"><span>${esc(f.n)}</span><span class="muted peq">${Math.round(f.p)} g de proteína · ${f.k} kcal</span></div>
      <button class="prim" data-act="usarFav" data-id="${esc(f.id)}">Anotar</button><button class="x" data-act="quitarFav" data-id="${esc(f.id)}" aria-label="Quitar de favoritas">×</button></li>`).join('')}</ul>`
    : `<p class="muted peq">Aún no tienes favoritas. En <b>Hoy</b>, toca la ☆ junto a una comida para guardarla aquí.</p>`;
  h += `</section>`;
  // Repetir ayer: todas o una por una, con la hora de ahora.
  const ayer = logsDe(diaKey(Date.now() - 864e5)).filter(l => l.items.length);
  h += `<section class="card" id="ayerCaja"><div class="fila"><h2>Repetir ayer</h2>${ayer.length > 1 ? `<button class="prim" data-act="ayerTodo">Copiar todas</button>` : ''}</div>`;
  h += ayer.length ? `<ul class="lista-r">${ayer.map(l => `<li><div class="cuerpo"><span class="etq">${ETIQ[l.comida] || ''} · ${hora(l.t)}</span><span>${esc(descLog(l))}</span><span class="muted peq">${Math.round(l.p)} g de proteína</span></div>
      <button data-act="ayerUna" data-id="${esc(l.id)}">Copiar</button></li>`).join('')}</ul><p class="muted peq">Se anotan hoy con la hora de ahora.</p>`
    : `<p class="muted peq">Ayer no anotaste comidas.</p>`;
  return h + `</section>`;
}
function recientes() {
  const vistos = [];
  S.logs.slice().sort((a, b) => b.t - a.t).forEach(l => l.items.forEach(i => { if (i.id && !vistos.includes(i.n) && vistos.length < 8) vistos.push(i.n); }));
  return vistos.length ? vistos : ['Huevo', 'Pechuga de pollo', 'Arroz blanco', 'Habichuelas guisadas', 'Proteína en polvo', 'Guineo maduro'];
}
function pintarPrevia() {
  const box = $('previa'); if (!box) return;
  const it = itemsDraft(), tot = it.reduce((a, x) => a + (x.p || 0), 0);
  if (!it.length) { box.innerHTML = ''; return; }
  const opts = todos().map(f => `<option value="${esc(f.id)}">${esc(f.n)}</option>`).join('');
  box.innerHTML = `<ul class="previa">${it.map((x, i) => x.f ? `<li>
      <div class="cuerpo"><b>${esc(x.f.n)}</b><span class="muted peq">${esc(cantidadTxt(x))}</span></div>
      <div class="paso"><button data-act="menos" data-i="${i}" aria-label="Menos">−</button><button data-act="mas" data-i="${i}" aria-label="Más">+</button></div>
      <span class="prot">${fmtN(x.p)} g</span><button class="x" data-act="quitar" data-i="${i}" aria-label="Quitar">×</button></li>`
    : `<li class="nr"><div class="cuerpo"><span>No reconocí «${esc(x.txt)}»</span>
      <select data-act="elegir" data-i="${i}" aria-label="Elegir alimento"><option value="">Elegir de la lista…</option>${opts}</select>
      <label class="peq">o proteína a mano (g) <input type="number" inputmode="decimal" min="0" step="1" data-act="pman" data-i="${i}" value="${x.pManual ?? ''}"></label></div>
      <button class="x" data-act="quitar" data-i="${i}" aria-label="Quitar">×</button></li>`).join('')}</ul>
    <p class="total">Total: <b>${fmtN(tot)} g de proteína</b> · ${it.reduce((a, x) => a + (x.k || 0), 0)} kcal</p>`;
}

function vistaPlan() {
  const hi = idxHoy(), hoyDk = diaKey(Date.now()), hechos = logsDe(hoyDk).map(l => l.plan).filter(Boolean);
  let h = `<section class="card"><h2>Hoy, ${DIAS[hi].toLowerCase()}</h2>`;
  COMIDAS.forEach(([m, lab], i) => {
    const n = S.plan[hi][i], r = n && receta(m, n), nu = r ? nutReceta(r) : null, key = `${hi}-${i}-${n}`, ya = hechos.includes(key);
    h += `<div class="pl"><span class="etq">${lab}</span><div class="cuerpo"><span>${esc(n || 'Sin elegir')}</span>${nu ? `<span class="muted peq">${nu.p} g de proteína · ${nu.k} kcal · ${rd(costoReceta(r))}</span>` : ''}</div>
      ${r ? (ya ? `<span class="ok">✓ Anotado</span>` : `<button class="prim" data-act="locomi" data-i="${i}">Lo comí</button>`) : ''}</div>`;
  });
  h += `</section><section class="card"><div class="fila"><h2>Semana</h2><button data-act="azar">Llenar al azar</button></div><div class="semana">`;
  DIAS.forEach((d, di) => {
    let pd = 0, cd = 0, sin = 0;
    const sel = COMIDAS.map(([m, lab], mi) => {
      const v = S.plan[di][mi], r = v && receta(m, v); if (r) pd += nutReceta(r).p;
      if (v) { const c = costoReceta(r); if (c == null) sin++; else cd += c; }
      return `<label class="peq">${lab}<select data-act="slot" data-d="${di}" data-m="${mi}">
        ${RECETAS[m].map(x => `<option${x[0] === v ? ' selected' : ''}>${esc(x[0])}</option>`).join('')}
        <option${v === FUERA ? ' selected' : ''}>${FUERA}</option><option value=""${!v ? ' selected' : ''}>Vacío</option></select></label>`;
    }).join('');
    h += `<div class="dia${di === hi ? ' hoy' : ''}"><div class="fila"><b>${d}</b><span class="muted peq">${pd} g${meta() ? ` de ${meta()}` : ''} · ${cd ? rd(cd) + (sin ? ' + —' : '') : '—'}</span></div>${sel}</div>`;
  });
  const cs = costoSemanaPlan();
  h += `</div><p>Costo aproximado de la semana: <b>${cs.c ? rd(cs.c) : '—'}</b>${cs.sin ? ` <span class="muted peq">(sin contar ${cs.sin} ${cs.sin > 1 ? 'comidas' : 'comida'} fuera o sin precio)</span>` : ''}</p>
    <p class="muted peq">La proteína del plan es aproximada y no cuenta meriendas ni batidas. Los precios son aproximados: edítalos abajo.</p></section>`;
  h += `<section class="card"><div class="fila"><h2>Lista del súper</h2><button data-act="lista">${mostrarLista ? 'Ocultar' : 'Ver'}</button></div>`;
  if (mostrarLista) {
    const t = totalesCompra(); let tot = 0, falta = 0, sin = 0;
    CAT.forEach(c => {
      const it = Object.keys(t).filter(k => ING[k][1] === c).sort((a, b) => ING[a][0].localeCompare(ING[b][0], 'es'));
      if (!it.length) return;
      h += `<h3 class="cat">${c}</h3><ul class="compra">${it.map(k => {
        const cc = costoIngQ(k, t[k]); if (cc == null) sin++; else { tot += cc; if (!S.checked[k]) falta += cc; }
        return `<li class="${S.checked[k] ? 'hecho' : ''}"><label><input type="checkbox" data-act="compra" data-k="${k}"${S.checked[k] ? ' checked' : ''}><span>${ING[k][0]}</span><span class="muted">${fmtCompra(t[k], ING[k][2])} · ${rd(cc)}</span></label></li>`;
      }).join('')}</ul>`;
    });
    h += `<p>Total aproximado: <b>${rd(tot)}</b> · te falta comprar: <b>${rd(falta)}</b>${sin ? ` <span class="muted peq">(${sin} sin precio)</span>` : ''}</p>`;
    h += `<div class="acc"><button class="prim" data-act="compartirLista">Compartir lista</button><button data-act="desmarcar">Desmarcar todo</button></div>`;
  }
  h += `</section>`;
  // Precios: los grises son aproximados (de datos.js); lo que escribas se guarda en S.precios.
  h += `<section class="card"><div class="fila"><h2>Precios (RD$)</h2><button data-act="precios">${mostrarPrecios ? 'Ocultar' : 'Editar'}</button></div>`;
  if (mostrarPrecios) {
    const fila = (k, nom, unidad, def) => `<li data-nom="${esc(norm(nom))}"><span>${esc(nom)}<small class="muted"> ${esc(unidad)}</small></span>
      <input type="number" inputmode="decimal" min="0" step="1" data-act="precio" data-k="${k}" value="${S.precios[k] ?? ''}" placeholder="${def ?? '—'}" aria-label="Precio de ${esc(nom)} ${esc(unidad)}"></li>`;
    h += `<p class="peq">Los números grises son <b>aproximados, no oficiales</b>: escribe encima lo que pagas tú. Si borras tu precio, vuelve el aproximado.</p>
      <input id="precioBuscar" type="search" placeholder="Buscar alimento…" aria-label="Buscar alimento">
      <h3 class="cat">Ingredientes del plan</h3><ul class="precios">${Object.keys(ING).sort((a, b) => ING[a][0].localeCompare(ING[b][0], 'es')).map(k => fila('ing:' + k, ING[k][0], 'por ' + UNID_ING[ING[k][2]], PRECIO_ING[k])).join('')}</ul>
      <h3 class="cat">Alimentos sueltos (por la porción que cuenta la app)</h3><ul class="precios">${todos().map(f => { const U = UNIDADES[f.d]; return fila('ali:' + f.id, f.n, `por ${U ? U.s : f.d} (${f.u[f.d]} g)`, PRECIO_ALI[f.id]); }).join('')}</ul>`;
  } else h += `<p class="muted peq">Para el costo de recetas, de la semana, de la lista y de lo que comes. Vienen precios aproximados para empezar.</p>`;
  return h + `</section>`;
}

function vistaSemana() {
  const M = meta(), ses = sesionesReloj(), dias = [];
  for (let i = 6; i >= 0; i--) { const t = Date.now() - i * 864e5, dk = diaKey(t); dias.push({ dk, t, p: protDe(dk), agua: S.agua[dk] || 0, ent: [...new Set(ses.filter(s => diaKey(Date.parse(s.start)) === dk).map(s => s.grupo))] }); }
  const tope = Math.max(M || 0, ...dias.map(d => d.p), 1);
  let h = tarjetaGraficaPeso();
  h += `<section class="card"><h2>Proteína, últimos 7 días</h2><div class="grafica" role="img" aria-label="Proteína por día comparada con la meta">`;
  if (M) h += `<div class="meta" style="bottom:${(100 * M / tope).toFixed(1)}%"><span>meta ${M} g</span></div>`;
  dias.forEach(d => { h += `<div class="col"><span class="v">${Math.round(d.p)}</span><div class="b${M && d.p >= meta(d.dk) ? ' ok' : ''}" style="height:${(100 * d.p / tope).toFixed(1)}%"></div></div>`; });
  h += `</div><div class="ejes">${dias.map(d => `<span>${new Date(d.t).toLocaleDateString('es-DO', { weekday: 'short' }).slice(0, 3)}<i class="${d.ent.length ? 'ent' : ''}" title="${esc(d.ent.join(', '))}"></i></span>`).join('')}</div>
    <p class="muted peq"><i class="ent leyenda"></i> día con entreno en el Reloj anómalo</p>`;
  const conE = dias.filter(d => d.ent.length && d.p), sinE = dias.filter(d => !d.ent.length && d.p);
  const prom = a => a.length ? Math.round(a.reduce((s, d) => s + d.p, 0) / a.length) : null;
  if (conE.length || sinE.length) h += `<p>Promedio en días de entreno: <b>${prom(conE) ?? '—'} g</b> · días de descanso: <b>${prom(sinE) ?? '—'} g</b></p>`;
  h += `<p class="muted">Agua: ${dias.map(d => d.agua).join(' · ')} vasos</p></section>`;
  // déficit en días de entreno
  const dE = dias.filter(d => d.ent.length);
  h += `<section class="card"><h2>Déficit en días de entreno</h2>`;
  if (!dE.length) h += `<p class="muted">Sin entrenos en los últimos 7 días.</p>`;
  else if (!S.cfg.peso) h += `<p class="muted">Pon tu peso en Ajustes para calcularlo.</p>`;
  else {
    const filas = dE.map(d => {
      const e = estadoEnergia(d.dk, d.dk === diaKey(Date.now()) ? Date.now() : d.t), xs = entrenamientosDe(d.dk), ch = chequeosEntreno(d.dk);
      return { d, e, xs, post: ch.every(c => c.postOk) };
    });
    h += `<div class="tbl"><table><thead><tr><th>Día</th><th>Entreno</th><th>Comido / necesario</th><th>Post</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td>${new Date(f.d.t).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' })}</td>
        <td>${esc(f.xs.map(x => `${x.grupos.join(' + ')} (${x.nivel})`).join(', '))}</td>
        <td><span class="sem ${f.e.est}">${f.e.comido} / ${f.e.nec.total}</span></td><td>${f.post ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table></div>`;
    const malos = filas.filter(f => f.e.est === 'deficit' && f.d.dk !== diaKey(Date.now())).length, cerrados = filas.filter(f => f.d.dk !== diaKey(Date.now())).length;
    if (cerrados) h += `<p>${malos ? `Comiste en <b>déficit ${malos} de ${cerrados}</b> días de entreno.` : 'Ningún día de entreno en déficit.'}
      ${malos >= 2 ? ' Repetido, frena la recuperación y la ganancia de músculo: sube la comida de esos días, sobre todo antes y después de entrenar.' : ''}</p>`;
  }
  h += `</section>`;
  h += `<section class="card"><h2>Ajustes</h2>
    <label class="lbl">Tu peso (kg) · se actualiza solo con tu última pesada de Hoy <input id="peso" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${S.cfg.peso ?? ''}" placeholder="75"></label>
    <span class="lbl">Proteína por kg de peso</span><div class="chips">${[1.6, 1.8, 2.0, 2.2].map(f => `<button class="chip${S.cfg.factor === f ? ' sel' : ''}" data-act="factor" data-f="${f}" aria-pressed="${S.cfg.factor === f}">${fmtN(f)} g/kg</button>`).join('')}</div>
    <p class="muted peq">Para ganar músculo entrenando fuerte, lo habitual es entre 1,6 y 2,2 g por kg al día.</p>
    <span class="lbl">Objetivo</span><div class="chips">${Object.keys(OBJ).map(k => `<button class="chip${S.cfg.objetivo === k ? ' sel' : ''}" data-act="objetivo" data-o="${k}" aria-pressed="${S.cfg.objetivo === k}">${OBJ[k].n}</button>`).join('')}</div>
    <label class="lbl">Calorías de mantenimiento al día <input id="mant" type="number" inputmode="numeric" min="1000" max="6000" step="10" value="${S.cfg.mant ?? ''}" placeholder="${S.cfg.peso ? 'automático: ' + mantenimiento() : 'pon tu peso primero'}"></label>
    <p class="muted peq">Si lo dejas vacío se usa peso × 31 kcal, típico de alguien activo. Si lo conoces mejor (por ejemplo, de una báscula o un nutricionista), escríbelo.</p>
    <label class="lbl">Meta de agua (vasos de 250 ml) <input id="aguaMeta" type="number" inputmode="numeric" min="1" max="24" step="1" value="${S.cfg.aguaMeta}"></label>
  </section>${tarjetaRecordatorios()}${tarjetaConfigSup()}
  <section class="card"><h2>Respaldo</h2>
    <div class="acc"><button class="prim" data-act="exportar">Exportar datos</button><button data-act="importar">Importar datos</button></div>
    <p class="muted peq">El archivo lleva tus comidas, agua, plan, alimentos propios, pesos, favoritas, suplementos y precios. Las fotos se quedan solo en este dispositivo.</p>
  </section>`;
  return h;
}

function tarjetaGraficaPeso() {
  const ks = diasPeso(), a = ajusteCalorias();
  let h = `<section class="card" id="pesoCaja"><div class="fila"><h2>Peso y tendencia</h2></div>`;
  if (!ks.length) return h + `<p class="muted">Anota tu peso de la mañana en <b>Hoy</b> y aquí verás la gráfica.</p></section>`;
  h += `<div class="chips">${[30, 60, 90].map(d => `<button class="chip${rangoPeso === d ? ' sel' : ''}" data-act="rangoPeso" data-d="${d}" aria-pressed="${rangoPeso === d}">${d} días</button>`).join('')}</div>`;
  h += graficaPeso(rangoPeso);
  if (!a) return h + `<p class="muted peq">Con 14 días de datos y al menos 7 pesadas calculo tu ritmo semanal (llevas ${ks.length}).</p></section>`;
  const M = mantenimiento(), f = OBJ[S.cfg.objetivo].f, recien = S.cfg.ajusteT && Date.now() - S.cfg.ajusteT < 14 * 864e5;
  h += `<p>${fraseAjuste(a)}</p>`;
  h += `<p class="muted peq">Cuenta: (${signo(a.desKg)} − ${signo(a.kgSem)}) kg/semana × 7700 kcal/kg ÷ 7 = ${Math.round(a.bruto)} kcal/día → ${a.dentro ? '0 (ya estás en rango)' : `${a.aj > 0 ? '+' : ''}${a.aj}`}. Ritmo medido en los últimos ${a.dias} días.</p>`;
  if (a.aj && M) h += recien ? `<p class="muted peq">Ajustaste la meta hace menos de 2 semanas: espera a ver el efecto antes de cambiarla otra vez.</p>`
    : `<button data-act="aplicarAjuste">Aplicar a mi meta: ${Math.round(M * f)} → ${Math.round(M * f) + a.aj} kcal al día</button>`;
  return h + `</section>`;
}
function tarjetaRecordatorios() {
  const R = S.cfg.rec, hay = 'Notification' in window, perm = hay ? Notification.permission : 'no';
  const opt = (v, sel, txt) => `<option value="${v}"${+sel === v ? ' selected' : ''}>${txt}</option>`;
  let h = `<section class="card" id="recCaja"><h2>Recordatorios</h2>
    <label class="check"><input type="checkbox" id="recAgua"${R.agua ? ' checked' : ''}> Agua</label>
    <div class="tres"><label class="lbl">Cada<select id="recCada">${[1.5, 2, 2.5, 3].map(v => opt(v, R.aguaCada, fmtN(v) + ' h')).join('')}</select></label>
      <label class="lbl">Desde<select id="recDesde">${[6, 7, 8, 9, 10].map(v => opt(v, R.desde, v + ':00')).join('')}</select></label>
      <label class="lbl">Hasta<select id="recHasta">${[18, 19, 20, 21, 22].map(v => opt(v, R.hasta, v + ':00')).join('')}</select></label></div>
    <label class="check"><input type="checkbox" id="recPost"${R.post ? ' checked' : ''}> Proteína después del entreno (si hay sesión del reloj hoy y no llegas a la meta post)</label>
    <span class="lbl">Horas de las comidas (sacadas de lo que sueles anotar; cámbialas si quieres)</span>
    <div class="tres">${COMIDAS.map(([c, lab]) => `<label class="lbl">${lab}<input type="time" data-act="horaCom" data-c="${c}" value="${horaComida(c)}"></label>`).join('')}</div>
    ${S.sup.items.some(x => x.id === 'creatina' && x.activo) ? `<label class="lbl">Hora de la creatina<input type="time" id="recCreat" value="${esc(R.creatinaHora)}"></label>` : ''}
    <h3 class="cat">Con la app abierta</h3>
    <p class="peq">${!hay ? 'Este navegador no permite avisos: los verás como mensaje dentro de la app.' : perm === 'granted' ? 'Avisos del sistema: <b>activados</b>.' : perm === 'denied' ? 'Bloqueaste los avisos: los verás como mensaje dentro de la app (puedes permitirlos en la configuración del navegador).' : 'Sin permiso todavía: los recordatorios salen como mensaje dentro de la app.'}</p>
    ${hay && perm === 'default' ? `<button data-act="permiso">Permitir avisos del sistema</button>` : ''}
    <h3 class="cat">Aunque la app esté cerrada</h3>
    <p class="muted peq">Una app web no puede sonar con fiabilidad estando cerrada. Lo seguro es tu calendario: este archivo crea eventos diarios con alarma (agua, comidas${S.sup.items.some(x => x.id === 'creatina' && x.activo) ? ' y creatina' : ''}).</p>
    <button class="prim" data-act="ics">Agregar recordatorios a mi calendario</button>
    <p class="muted peq">Si tu teléfono no lo abre directo, guárdalo e impórtalo en calendar.google.com → Configuración → Importar. Si cambias las horas, vuelve a generarlo.</p></section>`;
  return h;
}
function tarjetaConfigSup() {
  let h = `<section class="card" id="supCaja"><h2>Suplementos</h2><ul class="lista-r">`;
  S.sup.items.forEach((it, i) => {
    h += `<li class="supcfg"><label class="check"><input type="checkbox" data-act="supActivo" data-i="${i}"${it.activo ? ' checked' : ''}> <span>${esc(it.n)}</span></label>
      <label class="lbl">Dosis<input data-act="supDosis" data-i="${i}" value="${esc(it.dosis || '')}"></label>
      ${it.id === 'batida' ? `<div class="tres"><label class="lbl">Proteína por scoop (g)<input type="number" inputmode="decimal" min="0" step="0.5" data-act="supNum" data-campo="gScoop" data-i="${i}" value="${it.gScoop ?? ''}"></label>
        <label class="lbl">kcal por scoop<input type="number" inputmode="numeric" min="0" step="1" data-act="supNum" data-campo="kScoop" data-i="${i}" value="${it.kScoop ?? ''}"></label>
        <label class="lbl">Scoops por batida<input type="number" inputmode="decimal" min="0.5" step="0.5" data-act="supNum" data-campo="scoops" data-i="${i}" value="${it.scoops ?? 1}"></label></div>` : ''}
      ${it.id !== 'creatina' && it.id !== 'batida' ? `<button class="x" data-act="supQuitar" data-i="${i}" aria-label="Quitar ${esc(it.n)}">×</button>` : ''}</li>`;
  });
  h += `</ul><div class="dos"><label class="lbl">Otro suplemento<input id="supNuevoN" placeholder="Omega 3"></label><label class="lbl">Dosis<input id="supNuevoD" placeholder="1 cápsula"></label></div>
    <button data-act="supAgregar">Agregar</button></section>`;
  return h;
}

function render() {
  const v = $('vista');
  if (tab === 'agregar' && $('texto')) textoGuardado = $('texto').value;
  v.innerHTML = tab === 'hoy' ? vistaHoy() : tab === 'agregar' ? vistaAgregar() : tab === 'plan' ? vistaPlan() : vistaSemana();
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  if (tab === 'agregar') { pintarPrevia(); pintarFotoDraft(); }
  pintarFotos();
}

/* ---------- acciones ---------- */
function irA(id) { const el = $(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function guardarPeso() {
  const el = $('pesoHoy'), v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
  if (!(v >= 30 && v <= 250)) { aviso('Escribe tu peso en kg (entre 30 y 250).'); return; }
  const hoy = diaKey(Date.now());
  if (S.pesos[hoy] === Math.round(v * 100) / 100) { aviso('Ese peso ya está guardado.'); return; }
  registrarPeso(v); render(); aviso(`Peso guardado: ${fmtN(v)} kg. Meta: ${meta(hoy)} g de proteína.`);
}
function ajustarQ(i, dir) {
  const it = itemsDraft();
  const nTexto = it.length - draftExtra.length;
  if (i >= nTexto) { const x = draftExtra[i - nTexto]; x.q = Math.max(.5, x.q + dir * (x.u === 'g' ? 10 : .5)); if (x.gramos != null) x.gramos = x.q; calcular(x); return; }
  const x = it[i], paso = (x.u === 'g' || x.gramos != null) ? (x.u === 'g' ? 10 : .5) : .5;
  draftOverride[i] = Object.assign(draftOverride[i] || {}, { q: Math.max(paso, r1(x.q + dir * paso)) });
}
function quitar(i) {
  const nTexto = itemsDraft().length - draftExtra.length;
  if (i >= nTexto) { draftExtra.splice(i - nTexto, 1); return; }
  const partes = $('texto').value.split(/,|;|\n|\+| y (?![a-z]*media\b)/i).map(s => s.trim()).filter(s => s.length > 1);
  partes.splice(i, 1); $('texto').value = partes.join(', '); textoGuardado = $('texto').value;
  const o = {}; Object.keys(draftOverride).forEach(k => { k = +k; if (k < i) o[k] = draftOverride[k]; else if (k > i) o[k - 1] = draftOverride[k]; }); draftOverride = o;
}
async function guardarComida() {
  const it = itemsDraft().filter(x => x.f || x.pManual);
  if (!it.length && !fotoDraft) { aviso('Escribe qué comiste o toma una foto.'); return; }
  const [hh, mm] = ($('hora').value || '12:00').split(':').map(Number), d = new Date(); d.setHours(hh, mm, 0, 0);
  const id = 'c' + Date.now();
  const items = it.map(x => x.f ? { id: x.f.id, n: x.f.n, c: cantidadTxt(x), g: Math.round(x.g), p: x.p, k: x.k } : { n: x.txt, c: 'a mano', g: 0, p: +x.pManual || 0, k: 0 });
  const log = { id, t: d.getTime(), comida: $('comida').value, items, p: r1(items.reduce((a, x) => a + x.p, 0)), k: items.reduce((a, x) => a + x.k, 0), foto: !!fotoDraft, src: 'texto' };
  if (fotoDraft) { try { await fotoPut(id, fotoDraft); } catch (e) { log.foto = false; aviso('La foto no se pudo guardar.'); } }
  S.logs.push(log); guardar();
  textoGuardado = ''; draftExtra = []; draftOverride = {}; fotoDraft = null;
  aviso(`Guardado: ${Math.round(log.p)} g de proteína.`); tab = 'hoy'; render();
}
function pintarFotoDraft() {
  const b = $('fotoPrevia'); if (!b) return;
  if (!fotoDraft) { b.innerHTML = ''; return; }
  const u = URL.createObjectURL(fotoDraft);
  b.innerHTML = `<div class="fotoBox"><img src="${u}" alt="Foto de la comida"><button class="x" data-act="sinFoto" aria-label="Quitar foto">×</button></div><p class="muted peq">La foto queda como recuerdo. Escribe arriba lo que había para contar la proteína.</p>`;
}

/* ---------- código de barras (Open Food Facts) ---------- */
let stream = null, buscando = false;
function cerrarCamara() { buscando = false; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
async function abrirCodigo() {
  const c = $('codigoCaja'); c.hidden = false;
  const hay = 'BarcodeDetector' in window;
  c.innerHTML = `<div class="fila"><h2>Código de barras</h2><button class="x" data-act="cerrarCodigo" aria-label="Cerrar">×</button></div>
    ${hay ? '<video id="video" playsinline muted></video><p class="muted peq" id="camEstado">Apunta al código del paquete…</p>' : '<p class="muted peq">Este navegador no lee códigos con la cámara. Escribe los números del código.</p>'}
    <div class="dos"><input id="codigoTxt" inputmode="numeric" placeholder="7501234567890" aria-label="Número del código"><button data-act="buscarCodigo">Buscar</button></div>
    <div id="producto"></div>`;
  c.scrollIntoView({ behavior: 'smooth' });
  if (!hay) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('video'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    buscando = true;
    const loop = async () => {
      if (!buscando || !$('video')) return;
      try { const r = await det.detect(v); if (r.length) { cerrarCamara(); $('codigoTxt').value = r[0].rawValue; buscarProducto(r[0].rawValue); return; } } catch (e) {}
      setTimeout(loop, 250);
    };
    loop();
  } catch (e) { const s = $('camEstado'); if (s) s.textContent = 'No se pudo abrir la cámara. Escribe el código.'; }
}
async function buscarProducto(code) {
  code = String(code || '').replace(/\D/g, ''); const box = $('producto'); if (!code) return;
  box.innerHTML = '<p class="muted">Buscando…</p>';
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity`);
    const d = await r.json();
    const pr = d && d.status === 1 && d.product;
    const nom = pr ? (pr.product_name_es || pr.product_name || 'Producto') + (pr.brands ? ` (${pr.brands.split(',')[0]})` : '') : '';
    const p100 = pr && pr.nutriments ? pr.nutriments.proteins_100g : null, k100 = pr && pr.nutriments ? pr.nutriments['energy-kcal_100g'] : null;
    box.innerHTML = `${pr ? `<p><b>${esc(nom)}</b></p>` : '<p class="muted">No está en la base. Llena los datos de la etiqueta y queda guardado para la próxima vez.</p>'}
      <label class="lbl">Nombre <input id="prNom" value="${esc(nom)}" placeholder="Yogur de fresa"></label>
      <div class="dos"><label class="lbl">Proteína por 100 g <input id="prP" type="number" inputmode="decimal" step="0.1" value="${p100 ?? ''}"></label>
      <label class="lbl">Cuánto comiste (g) <input id="prG" type="number" inputmode="decimal" step="1" value="${Math.round((pr && pr.serving_quantity) || 100)}"></label></div>
      <input id="prK" type="hidden" value="${k100 ?? 0}"><input id="prCode" type="hidden" value="${code}">
      <button class="prim ancho" data-act="agregarProducto">Agregar</button>`;
  } catch (e) { box.innerHTML = '<p class="muted">Sin conexión. Prueba luego, o escribe el alimento arriba.</p>'; }
}
function agregarProducto() {
  const n = $('prNom').value.trim() || 'Producto', p = parseFloat(($('prP').value || '0').replace(',', '.')), g = parseFloat($('prG').value) || 100, k = parseFloat($('prK').value) || 0, code = $('prCode').value;
  if (!(p >= 0)) { aviso('Pon la proteína por 100 g de la etiqueta.'); return; }
  let f = S.mis.find(x => x.code === code && code) || S.mis.find(x => norm(x.n) === norm(n));
  if (!f) { f = { id: 'm' + Date.now(), n, a: [norm(n)], p, k, u: { porcion: g }, d: 'porcion', code }; S.mis.push(f); }
  else Object.assign(f, { n, p, k, u: Object.assign(f.u, { porcion: g }) });
  guardar();
  draftExtra.push(calcular({ txt: n, f, q: g, u: 'g', gramos: g }));
  cerrarCamara(); $('codigoCaja').hidden = true; pintarPrevia(); aviso(`${n} agregado.`);
}

/* ---------- respaldo ---------- */
async function entregar(nombre, texto, tipo) {
  const f = new File([texto], nombre, { type: tipo });
  try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nombre }); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); aviso('Descargado: ' + nombre);
}
function importar(d) {
  if (!d || d.app !== 'comida' || !Array.isArray(d.logs)) throw new Error('formato');
  const ids = new Set(S.logs.map(l => l.id)); let n = 0;
  d.logs.forEach(l => { if (l && l.id && !ids.has(l.id)) { S.logs.push(Object.assign(l, { foto: false })); n++; } });
  for (const k in d.agua || {}) S.agua[k] = Math.max(S.agua[k] || 0, d.agua[k]);
  (d.mis || []).forEach(f => { if (!S.mis.some(x => x.id === f.id)) S.mis.push(f); });
  if (!S.cfg.peso && d.cfg && d.cfg.peso) S.cfg = Object.assign(S.cfg, d.cfg, { rec: Object.assign(recInicial(), S.cfg.rec, esObj(d.cfg.rec) ? d.cfg.rec : {}) });
  // Campos de v7 (respaldos viejos no los traen): se suman sin pisar lo que ya hay.
  if (esObj(d.pesos)) { for (const k in d.pesos) if (S.pesos[k] == null && +d.pesos[k] > 0) S.pesos[k] = +d.pesos[k]; const u = diasPeso().pop(); if (u) S.cfg.peso = +S.pesos[u]; }
  if (Array.isArray(d.favs)) d.favs.forEach(f => { if (f && f.sig && !S.favs.some(x => x.sig === f.sig)) S.favs.push(f); });
  if (esObj(d.sup)) {
    (d.sup.items || []).forEach(it => { if (it && it.id && !S.sup.items.some(x => x.id === it.id)) S.sup.items.push(it); });
    for (const k in d.sup.hecho || {}) S.sup.hecho[k] = Object.assign({}, d.sup.hecho[k], S.sup.hecho[k] || {});
  }
  if (esObj(d.precios)) for (const k in d.precios) if (S.precios[k] == null) S.precios[k] = d.precios[k];
  guardar(); return n;
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act],[data-tab]'); if (!b) return;
  if (b.dataset.tab) { if (b.dataset.tab !== tab) cerrarCamara(); tab = b.dataset.tab; borrarPend = null; render(); window.scrollTo(0, 0); return; }
  const a = b.dataset.act, i = +b.dataset.i, hoy = diaKey(Date.now());
  if (b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  switch (a) {
    case 'vaso': S.agua[hoy] = (S.agua[hoy] || 0) === i + 1 ? i : i + 1; S.aguaT = Date.now(); guardar(); render(); break;
    case 'aguaMas': S.agua[hoy] = (S.agua[hoy] || 0) + 1; S.aguaT = Date.now(); guardar(); $('recAviso').hidden = true; render(); break;
    case 'aguaMenos': S.agua[hoy] = Math.max(0, (S.agua[hoy] || 0) - 1); guardar(); render(); break;
    case 'borrar':
      if (borrarPend !== b.dataset.id) { borrarPend = b.dataset.id; render(); setTimeout(() => { if (borrarPend === b.dataset.id) { borrarPend = null; if (tab === 'hoy') render(); } }, 3000); }
      else { S.logs = S.logs.filter(l => l.id !== borrarPend); fotoDel(borrarPend); borrarPend = null; guardar(); render(); }
      break;
    case 'chip': { const t = $('texto'); t.value = (t.value.trim() ? t.value.trim().replace(/,$/, '') + ', ' : '') + '1 ' + b.dataset.n; textoGuardado = t.value; pintarPrevia(); break; }
    case 'menos': ajustarQ(i, -1); pintarPrevia(); break;
    case 'mas': ajustarQ(i, 1); pintarPrevia(); break;
    case 'quitar': quitar(i); pintarPrevia(); break;
    case 'foto': $('fotoInput').click(); break;
    case 'sinFoto': fotoDraft = null; pintarFotoDraft(); break;
    case 'codigo': abrirCodigo(); break;
    case 'cerrarCodigo': cerrarCamara(); $('codigoCaja').hidden = true; break;
    case 'buscarCodigo': cerrarCamara(); buscarProducto($('codigoTxt').value); break;
    case 'agregarProducto': agregarProducto(); break;
    case 'guardarComida': guardarComida(); break;
    case 'locomi': {
      const hi = idxHoy(), [m] = COMIDAS[i], n = S.plan[hi][i], r = receta(m, n); if (!r) break;
      const nu = nutReceta(r), t = Date.now();
      S.logs.push({ id: 'c' + t, t, comida: m, items: [{ n, c: 'del plan', g: 0, p: nu.p, k: nu.k }], p: nu.p, k: nu.k, foto: false, src: 'plan', plan: `${hi}-${i}-${n}` });
      guardar(); aviso(`Anotado: ${nu.p} g de proteína.`); render(); break;
    }
    case 'azar':
      S.plan = DIAS.map(() => COMIDAS.map(([m]) => RECETAS[m][Math.floor(Math.random() * RECETAS[m].length)][0]));
      for (let d = 1; d < 7; d++) while (S.plan[d][1] === S.plan[d - 1][1]) S.plan[d][1] = RECETAS.almuerzo[Math.floor(Math.random() * RECETAS.almuerzo.length)][0];
      S.checked = {}; guardar(); render(); break;
    case 'lista': mostrarLista = !mostrarLista; render(); break;
    case 'desmarcar': S.checked = {}; guardar(); render(); break;
    case 'compartirLista': {
      const txt = textoCompra(); if (!txt) { aviso('Ya tienes todo marcado.'); break; }
      try { if (navigator.share) { await navigator.share({ title: 'Lista del súper', text: txt }); break; } } catch (err) { if (err && err.name === 'AbortError') break; }
      try { await navigator.clipboard.writeText(txt); aviso('Lista copiada.'); } catch (err) { aviso('No se pudo copiar.'); }
      break;
    }
    case 'factor': S.cfg.factor = +b.dataset.f; guardar(); render(); break;
    case 'objetivo': S.cfg.objetivo = b.dataset.o; guardar(); render(); break;
    case 'exportar': entregar(`comida-${hoy}.json`, JSON.stringify({ app: 'comida', v: 2, exportado: new Date().toISOString(), cfg: S.cfg, logs: S.logs, agua: S.agua, plan: S.plan, mis: S.mis, pesos: S.pesos, favs: S.favs, sup: S.sup, precios: S.precios }, null, 1), 'application/json'); break;
    // --- v7: peso, sugerencias, favoritas, suplementos, recuperación, recordatorios, precios ---
    case 'guardarPeso': guardarPeso(); break;
    case 'verPeso': tab = 'semana'; render(); irA('pesoCaja'); break;
    case 'rangoPeso': rangoPeso = +b.dataset.d; render(); break;
    case 'aplicarAjuste': {
      const a = ajusteCalorias(), M = mantenimiento(); if (!a || !a.aj || !M) break;
      S.cfg.mant = Math.max(1000, Math.min(6000, Math.round((M + a.aj / OBJ[S.cfg.objetivo].f) / 10) * 10)); S.cfg.ajusteT = Date.now();
      guardar(); render(); aviso(`Meta nueva: ${Math.round(S.cfg.mant * OBJ[S.cfg.objetivo].f)} kcal al día.`); break;
    }
    case 'sugP': {
      const x = sugCache[i]; if (!x) break;
      const t = nuevoT(), items = x.c.map(o => itemDe(o.id, o.u, o.q));
      S.logs.push({ id: 'c' + t, t, comida: comidaPorHora(t), items, p: r1(items.reduce((a, it) => a + it.p, 0)), k: items.reduce((a, it) => a + it.k, 0), foto: false, src: 'sugerencia' });
      guardar(); aviso(`Anotado: ${Math.round(x.p)} g de proteína.`); render(); break;
    }
    case 'fav': {
      const l = S.logs.find(x => x.id === b.dataset.id); if (!l || !l.items.length) break;
      const sg = firma(l.items), j = S.favs.findIndex(f => f.sig === sg);
      if (j >= 0) { S.favs.splice(j, 1); aviso('Quitada de favoritas.'); }
      else { S.favs.push({ id: 'f' + Date.now(), sig: sg, n: descLog(l), comida: l.comida, items: l.items.map(it => Object.assign({}, it)), p: l.p, k: l.k }); aviso('Guardada en favoritas.'); }
      guardar(); render(); break;
    }
    case 'usarFav': {
      const f = S.favs.find(x => x.id === b.dataset.id); if (!f) break;
      const t = nuevoT(); copiarLog(f, t, comidaPorHora(t)); guardar(); aviso(`Anotado: ${Math.round(f.p)} g de proteína.`); tab = 'hoy'; render(); window.scrollTo(0, 0); break;
    }
    case 'quitarFav': S.favs = S.favs.filter(x => x.id !== b.dataset.id); guardar(); render(); break;
    case 'ayerUna': { const l = S.logs.find(x => x.id === b.dataset.id); if (!l) break; copiarLog(l, nuevoT()); guardar(); aviso(`Copiada: ${Math.round(l.p)} g de proteína.`); render(); break; }
    case 'ayerTodo': {
      const ls = logsDe(diaKey(Date.now() - 864e5)).filter(l => l.items.length); ls.forEach(l => copiarLog(l, nuevoT()));
      guardar(); aviso(`Copiadas ${ls.length} comidas de ayer.`); tab = 'hoy'; render(); window.scrollTo(0, 0); break;
    }
    case 'ir': tab = 'agregar'; render(); irA(b.dataset.to); break;
    case 'irAgregar': $('recAviso').hidden = true; tab = 'agregar'; render(); window.scrollTo(0, 0); break;
    case 'recCerrar': $('recAviso').hidden = true; break;
    case 'sup': marcarSup(b.dataset.id); render(); break;
    case 'sueno': anotarBien('sueno', +b.dataset.v); if (leerBien()[hoy].energia != null) editarBien = false; render(); break;
    case 'energia': anotarBien('energia', +b.dataset.v); editarBien = false; render(); break;
    case 'editarBien': editarBien = true; render(); break;
    case 'permiso':
      try { await Notification.requestPermission(); } catch (err) {}
      render(); aviso(Notification.permission === 'granted' ? 'Avisos activados.' : 'Sin permiso: verás los recordatorios dentro de la app.'); break;
    case 'ics': { const x = textoICS(); entregar('recordatorios-comida.ics', x.txt, 'text/calendar'); break; }
    case 'precios': mostrarPrecios = !mostrarPrecios; render(); break;
    case 'supAgregar': {
      const n = $('supNuevoN').value.trim(); if (!n) { aviso('Escribe el nombre del suplemento.'); break; }
      S.sup.items.push({ id: 's' + Date.now(), n, dosis: $('supNuevoD').value.trim(), activo: true }); guardar(); render(); break;
    }
    case 'supQuitar': S.sup.items.splice(i, 1); guardar(); render(); break;
    case 'importar': $('importInput').click(); break;
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'texto') { textoGuardado = el.value; draftOverride = {}; pintarPrevia(); }
  if (el.id === 'precioBuscar') { const q = norm(el.value); document.querySelectorAll('.precios li').forEach(li => { li.hidden = q && !li.dataset.nom.includes(q); }); }
  if (el.dataset && el.dataset.act === 'pman') { const i = +el.dataset.i; draftOverride[i] = Object.assign(draftOverride[i] || {}, { pManual: parseFloat(el.value) || 0 }); }
});
document.addEventListener('change', async e => {
  const el = e.target, a = el.dataset ? el.dataset.act : null;
  if (a === 'pman') pintarPrevia();
  if (a === 'elegir') { const f = todos().find(x => x.id === el.value); draftOverride[+el.dataset.i] = Object.assign(draftOverride[+el.dataset.i] || {}, { f: f || null }); pintarPrevia(); }
  if (a === 'slot') { S.plan[+el.dataset.d][+el.dataset.m] = el.value; guardar(); render(); }
  if (a === 'compra') { S.checked[el.dataset.k] = el.checked; guardar(); render(); }
  if (el.id === 'pesoHoy') guardarPeso();
  if (a === 'precio') { const v = parseFloat(String(el.value).replace(',', '.')); if (el.value === '') delete S.precios[el.dataset.k]; else if (v >= 0) S.precios[el.dataset.k] = v; guardar(); }
  if (a === 'horaCom') { S.cfg.rec.horas[el.dataset.c] = el.value || ''; guardar(); }
  if (el.id === 'recCreat' && el.value) { S.cfg.rec.creatinaHora = el.value; guardar(); }
  if (['recAgua', 'recPost'].includes(el.id)) { S.cfg.rec[el.id === 'recAgua' ? 'agua' : 'post'] = el.checked; guardar(); }
  if (el.id === 'recCada') { S.cfg.rec.aguaCada = +el.value; guardar(); }
  if (el.id === 'recDesde') { S.cfg.rec.desde = +el.value; guardar(); }
  if (el.id === 'recHasta') { S.cfg.rec.hasta = +el.value; guardar(); }
  if (a === 'supActivo') { S.sup.items[+el.dataset.i].activo = el.checked; guardar(); render(); }
  if (a === 'supDosis') { S.sup.items[+el.dataset.i].dosis = el.value.trim(); guardar(); }
  if (a === 'supNum') { const v = parseFloat(String(el.value).replace(',', '.')); if (v >= 0) { S.sup.items[+el.dataset.i][el.dataset.campo] = v; guardar(); } }
  if (el.id === 'peso') { const v = parseFloat(String(el.value).replace(',', '.')); if (v >= 30 && v <= 250) { S.cfg.peso = v; guardar(); render(); aviso(`Meta: ${meta()} g de proteína al día.`); } }
  if (el.id === 'mant') { const v = parseInt(el.value, 10); S.cfg.mant = v >= 1000 && v <= 6000 ? v : null; guardar(); render(); }
  if (el.id === 'aguaMeta') { const v = parseInt(el.value, 10); if (v >= 1 && v <= 24) { S.cfg.aguaMeta = v; guardar(); } }
  if (el.id === 'fotoInput' && el.files[0]) { try { fotoDraft = await reducir(el.files[0]); } catch (err) { aviso('No se pudo leer la foto.'); } el.value = ''; pintarFotoDraft(); }
  if (el.id === 'importInput' && el.files[0]) {
    try { const n = importar(JSON.parse(await el.files[0].text())); aviso(n ? `Importadas ${n} comidas.` : 'Nada nuevo: ya tenías todo.'); render(); }
    catch (err) { aviso('Ese archivo no es un respaldo de Comida.'); }
    el.value = '';
  }
});
window.addEventListener('storage', ev => { if ((ev.key === KEY_RELOJ || ev.key === KEY_BIEN) && tab !== 'agregar') render(); });
setInterval(() => { revisarRecordatorios(); if (tab === 'hoy' && !document.activeElement?.matches('input,select,textarea')) render(); }, 60000);
setTimeout(revisarRecordatorios, 4000);

// Copia sin conexión. Si llega una versión nueva, la app se recarga sola una vez para mostrarla.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const habia = !!navigator.serviceWorker.controller; let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !recargado) { recargado = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); });
  }).catch(() => {});
}
render();
