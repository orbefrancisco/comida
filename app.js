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
function nuevo() {
  return { cfg: { peso: null, factor: 1.8, aguaMeta: 8, mant: null, objetivo: 'mantener' }, logs: [], agua: {}, plan: PLAN_INICIAL.map(d => d.slice()), checked: {}, mis: [] };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !Array.isArray(S.logs)) S = nuevo();
S = Object.assign(nuevo(), S, { cfg: Object.assign(nuevo().cfg, S.cfg || {}) });
function guardar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { aviso('No se pudo guardar en este dispositivo.'); } }

let tab = 'hoy', borrarPend = null, mostrarLista = false, draftExtra = [], draftOverride = {}, fotoDraft = null;

const meta = () => S.cfg.peso ? Math.round(S.cfg.peso * S.cfg.factor) : null;
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
const POST_GKG = .3, PRE_H = 4;
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
  return sesionesDe(dk).map(x => {
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

/* ---------- avisos ---------- */
let avisoT = 0;
function aviso(msg) { const el = $('aviso'); el.textContent = msg; el.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- vistas ---------- */
function barra(v, m) { const pc = m ? Math.min(100, 100 * v / m) : 0; return `<div class="track"><div class="fill" style="width:${pc.toFixed(1)}%"></div></div>`; }

function vistaHoy() {
  const hoy = diaKey(Date.now()), ls = logsDe(hoy), p = protDe(hoy), M = meta();
  const ses = sesionesReloj().filter(s => diaKey(Date.parse(s.start)) === hoy);
  const vasos = S.agua[hoy] || 0, vm = S.cfg.aguaMeta;
  const ultima = ls.length ? ls[ls.length - 1].t : null;
  let h = `<p class="fecha">${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>`;
  h += `<section class="card"><div class="fila"><h2>Proteína</h2><span class="grande">${Math.round(p)}<small> / ${M ?? '—'} g</small></span></div>${barra(p, M)}`;
  h += M ? `<p class="muted">${p >= M ? 'Meta cumplida.' : `Te faltan <b>${Math.round(M - p)} g</b>.`} Meta: ${fmtN(S.cfg.factor)} g por kg × ${fmtN(S.cfg.peso)} kg.</p>`
    : `<label class="inline">Tu peso (kg) para calcular la meta <input id="pesoRapido" type="number" inputmode="decimal" min="30" max="250" step="0.1" placeholder="75"></label>`;
  h += `</section>`;
  h += tarjetaCombustible(hoy, ses.length);
  // agua
  h += `<section class="card"><div class="fila"><h2>Agua</h2><span class="grande">${fmtN(vasos * VASO_ML / 1000)}<small> / ${fmtN(vm * VASO_ML / 1000)} L</small></span></div>
    <div class="vasos" role="group" aria-label="Vasos de agua">`;
  for (let i = 0; i < Math.max(vm, vasos); i++) h += `<button class="vaso${i < vasos ? ' on' : ''}" data-act="vaso" data-i="${i}" aria-label="Vaso ${i + 1}${i < vasos ? ', tomado' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l-1.5 17a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z"/></svg></button>`;
  h += `</div><div class="acc"><button data-act="aguaMenos">− Vaso</button><button class="prim" data-act="aguaMas">+ Vaso (250 ml)</button></div></section>`;
  // horario
  h += `<section class="card"><div class="fila"><h2>Lo que comiste</h2>${ultima ? `<span class="muted">última hace ${hace(ultima)}</span>` : ''}</div>`;
  h += ls.length ? `<ol class="linea">${ls.map(itemLog).join('')}</ol>` : `<p class="muted">Todavía nada hoy. Toca <b>Agregar</b> para anotar.</p>`;
  h += `</section>`;
  return h;
}
const ETQ_EST = { ok: 'Bien', atencion: 'Atención', deficit: 'Déficit' };
function tarjetaCombustible(dk, hayEntreno) {
  let h = `<section class="card"><h2>Combustible vs entreno</h2>`;
  if (!hayEntreno) return h + `<p class="muted">No hay entreno de hoy en el Reloj anómalo. Cuando entrenes, aquí verás si lo que comes alcanza para la intensidad de la sesión.</p></section>`;
  if (!S.cfg.peso) return h + `<p class="muted">Pon tu peso arriba para calcular el gasto del entreno.</p></section>`;
  const ch = chequeosEntreno(dk), e = estadoEnergia(dk, Date.now()), p = protDe(dk), M = meta();
  ch.forEach(c => {
    h += `<div class="sesion"><div class="fila"><b>${esc(c.x.s.grupo)} · ${hora(c.x.t0)}</b><span class="muted peq">${Math.round(c.x.dur / 60)} min · ${c.x.s.series} series</span></div>
      <div class="fila"><span class="peq">Intensidad <b>${c.x.nivel}</b></span><span class="peq">≈ <b>${c.x.kcal} kcal</b> extra</span></div>${barra(c.x.I, 1)}</div>`;
  });
  h += `<div class="fila"><span>Energía de hoy</span><span class="sem ${e.est}">${ETQ_EST[e.est]}</span></div>
    ${barra(e.comido, e.nec.total)}
    <p class="peq">Comiste <b>${e.comido} kcal</b> de <b>${e.nec.total}</b> (mantenimiento ${e.nec.base} + entreno ${e.nec.ent}).
      A esta hora lo esperable son unas ${e.esperado} kcal.</p>`;
  h += `<ul class="checks">`;
  ch.forEach(c => {
    h += c.hAntes == null ? `<li class="mal">No hay comida anotada antes de entrenar ${esc(c.x.s.grupo.toLowerCase())}.</li>`
      : `<li class="${c.pre ? 'bien' : 'mal'}">${c.pre ? `Comiste ${fmtN(r1(c.hAntes))} h antes de entrenar.` : `Llegaste al entreno con ${fmtN(r1(c.hAntes))} h sin comer (lo ideal es menos de ${PRE_H} h).`}</li>`;
    h += `<li class="${c.postOk ? 'bien' : c.abierta ? 'pend' : 'mal'}">Proteína después del entreno: <b>${c.post} de ${c.postMeta} g</b>${c.postOk ? '.' : c.abierta ? ' · todavía estás a tiempo.' : ' · la ventana ya cerró.'}</li>`;
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
  const desc = l.items.map(i => i.n + (i.c ? ` (${i.c})` : '')).join(', ') || 'Solo foto';
  return `<li><span class="hora">${hora(l.t)}</span><div class="cuerpo"><span class="etq">${ETIQ[l.comida] || ''}</span><span>${esc(desc)}</span>
    ${l.foto ? `<img data-foto="${esc(l.id)}" alt="Foto de la comida" class="mini">` : ''}</div>
    <span class="prot">${Math.round(l.p)} g</span><button class="x" data-act="borrar" data-id="${esc(l.id)}" aria-label="Borrar">${borrarPend === l.id ? '¿Borrar?' : '×'}</button></li>`;
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
  return h;
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
    h += `<div class="pl"><span class="etq">${lab}</span><div class="cuerpo"><span>${esc(n || 'Sin elegir')}</span>${nu ? `<span class="muted peq">${nu.p} g de proteína · ${nu.k} kcal</span>` : ''}</div>
      ${r ? (ya ? `<span class="ok">✓ Anotado</span>` : `<button class="prim" data-act="locomi" data-i="${i}">Lo comí</button>`) : ''}</div>`;
  });
  h += `</section><section class="card"><div class="fila"><h2>Semana</h2><button data-act="azar">Llenar al azar</button></div><div class="semana">`;
  DIAS.forEach((d, di) => {
    let pd = 0;
    const sel = COMIDAS.map(([m, lab], mi) => {
      const v = S.plan[di][mi], r = v && receta(m, v); if (r) pd += nutReceta(r).p;
      return `<label class="peq">${lab}<select data-act="slot" data-d="${di}" data-m="${mi}">
        ${RECETAS[m].map(x => `<option${x[0] === v ? ' selected' : ''}>${esc(x[0])}</option>`).join('')}
        <option${v === FUERA ? ' selected' : ''}>${FUERA}</option><option value=""${!v ? ' selected' : ''}>Vacío</option></select></label>`;
    }).join('');
    h += `<div class="dia${di === hi ? ' hoy' : ''}"><div class="fila"><b>${d}</b><span class="muted peq">${pd} g${meta() ? ` de ${meta()}` : ''}</span></div>${sel}</div>`;
  });
  h += `</div><p class="muted peq">La proteína del plan es aproximada y no cuenta meriendas ni batidas.</p></section>`;
  h += `<section class="card"><div class="fila"><h2>Lista del súper</h2><button data-act="lista">${mostrarLista ? 'Ocultar' : 'Ver'}</button></div>`;
  if (mostrarLista) {
    const t = totalesCompra();
    CAT.forEach(c => {
      const it = Object.keys(t).filter(k => ING[k][1] === c).sort((a, b) => ING[a][0].localeCompare(ING[b][0], 'es'));
      if (!it.length) return;
      h += `<h3 class="cat">${c}</h3><ul class="compra">${it.map(k => `<li class="${S.checked[k] ? 'hecho' : ''}"><label><input type="checkbox" data-act="compra" data-k="${k}"${S.checked[k] ? ' checked' : ''}><span>${ING[k][0]}</span><span class="muted">${fmtCompra(t[k], ING[k][2])}</span></label></li>`).join('')}</ul>`;
    });
    h += `<div class="acc"><button class="prim" data-act="compartirLista">Compartir lista</button><button data-act="desmarcar">Desmarcar todo</button></div>`;
  }
  return h + `</section>`;
}

function vistaSemana() {
  const M = meta(), ses = sesionesReloj(), dias = [];
  for (let i = 6; i >= 0; i--) { const t = Date.now() - i * 864e5, dk = diaKey(t); dias.push({ dk, t, p: protDe(dk), agua: S.agua[dk] || 0, ent: ses.filter(s => diaKey(Date.parse(s.start)) === dk).map(s => s.grupo) }); }
  const tope = Math.max(M || 0, ...dias.map(d => d.p), 1);
  let h = `<section class="card"><h2>Proteína, últimos 7 días</h2><div class="grafica" role="img" aria-label="Proteína por día comparada con la meta">`;
  if (M) h += `<div class="meta" style="bottom:${(100 * M / tope).toFixed(1)}%"><span>meta ${M} g</span></div>`;
  dias.forEach(d => { h += `<div class="col"><span class="v">${Math.round(d.p)}</span><div class="b${M && d.p >= M ? ' ok' : ''}" style="height:${(100 * d.p / tope).toFixed(1)}%"></div></div>`; });
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
      const e = estadoEnergia(d.dk, d.dk === diaKey(Date.now()) ? Date.now() : d.t), xs = sesionesDe(d.dk), ch = chequeosEntreno(d.dk);
      return { d, e, xs, post: ch.every(c => c.postOk) };
    });
    h += `<div class="tbl"><table><thead><tr><th>Día</th><th>Entreno</th><th>Comido / necesario</th><th>Post</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td>${new Date(f.d.t).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' })}</td>
        <td>${esc(f.xs.map(x => `${x.s.grupo} (${x.nivel})`).join(', '))}</td>
        <td><span class="sem ${f.e.est}">${f.e.comido} / ${f.e.nec.total}</span></td><td>${f.post ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table></div>`;
    const malos = filas.filter(f => f.e.est === 'deficit' && f.d.dk !== diaKey(Date.now())).length, cerrados = filas.filter(f => f.d.dk !== diaKey(Date.now())).length;
    if (cerrados) h += `<p>${malos ? `Comiste en <b>déficit ${malos} de ${cerrados}</b> días de entreno.` : 'Ningún día de entreno en déficit.'}
      ${malos >= 2 ? ' Repetido, frena la recuperación y la ganancia de músculo: sube la comida de esos días, sobre todo antes y después de entrenar.' : ''}</p>`;
  }
  h += `</section>`;
  h += `<section class="card"><h2>Ajustes</h2>
    <label class="lbl">Tu peso (kg) <input id="peso" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${S.cfg.peso ?? ''}" placeholder="75"></label>
    <span class="lbl">Proteína por kg de peso</span><div class="chips">${[1.6, 1.8, 2.0, 2.2].map(f => `<button class="chip${S.cfg.factor === f ? ' sel' : ''}" data-act="factor" data-f="${f}" aria-pressed="${S.cfg.factor === f}">${fmtN(f)} g/kg</button>`).join('')}</div>
    <p class="muted peq">Para ganar músculo entrenando fuerte, lo habitual es entre 1,6 y 2,2 g por kg al día.</p>
    <span class="lbl">Objetivo</span><div class="chips">${Object.keys(OBJ).map(k => `<button class="chip${S.cfg.objetivo === k ? ' sel' : ''}" data-act="objetivo" data-o="${k}" aria-pressed="${S.cfg.objetivo === k}">${OBJ[k].n}</button>`).join('')}</div>
    <label class="lbl">Calorías de mantenimiento al día <input id="mant" type="number" inputmode="numeric" min="1000" max="6000" step="10" value="${S.cfg.mant ?? ''}" placeholder="${S.cfg.peso ? 'automático: ' + mantenimiento() : 'pon tu peso primero'}"></label>
    <p class="muted peq">Si lo dejas vacío se usa peso × 31 kcal, típico de alguien activo. Si lo conoces mejor (por ejemplo, de una báscula o un nutricionista), escríbelo.</p>
    <label class="lbl">Meta de agua (vasos de 250 ml) <input id="aguaMeta" type="number" inputmode="numeric" min="1" max="24" step="1" value="${S.cfg.aguaMeta}"></label>
  </section>
  <section class="card"><h2>Respaldo</h2>
    <div class="acc"><button class="prim" data-act="exportar">Exportar datos</button><button data-act="importar">Importar datos</button></div>
    <p class="muted peq">El archivo lleva tus comidas, agua, plan y alimentos propios. Las fotos se quedan solo en este dispositivo.</p>
  </section>`;
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
  if (!S.cfg.peso && d.cfg && d.cfg.peso) S.cfg = Object.assign(S.cfg, d.cfg);
  guardar(); return n;
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act],[data-tab]'); if (!b) return;
  if (b.dataset.tab) { if (b.dataset.tab !== tab) cerrarCamara(); tab = b.dataset.tab; borrarPend = null; render(); window.scrollTo(0, 0); return; }
  const a = b.dataset.act, i = +b.dataset.i, hoy = diaKey(Date.now());
  if (b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  switch (a) {
    case 'vaso': S.agua[hoy] = (S.agua[hoy] || 0) === i + 1 ? i : i + 1; guardar(); render(); break;
    case 'aguaMas': S.agua[hoy] = (S.agua[hoy] || 0) + 1; guardar(); render(); break;
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
    case 'exportar': entregar(`comida-${hoy}.json`, JSON.stringify({ app: 'comida', v: 1, exportado: new Date().toISOString(), cfg: S.cfg, logs: S.logs, agua: S.agua, plan: S.plan, mis: S.mis }, null, 1), 'application/json'); break;
    case 'importar': $('importInput').click(); break;
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'texto') { textoGuardado = el.value; draftOverride = {}; pintarPrevia(); }
  if (el.dataset && el.dataset.act === 'pman') { const i = +el.dataset.i; draftOverride[i] = Object.assign(draftOverride[i] || {}, { pManual: parseFloat(el.value) || 0 }); }
});
document.addEventListener('change', async e => {
  const el = e.target, a = el.dataset ? el.dataset.act : null;
  if (a === 'pman') pintarPrevia();
  if (a === 'elegir') { const f = todos().find(x => x.id === el.value); draftOverride[+el.dataset.i] = Object.assign(draftOverride[+el.dataset.i] || {}, { f: f || null }); pintarPrevia(); }
  if (a === 'slot') { S.plan[+el.dataset.d][+el.dataset.m] = el.value; guardar(); render(); }
  if (a === 'compra') { S.checked[el.dataset.k] = el.checked; guardar(); render(); }
  if (el.id === 'peso' || el.id === 'pesoRapido') { const v = parseFloat(String(el.value).replace(',', '.')); if (v >= 30 && v <= 250) { S.cfg.peso = v; guardar(); render(); aviso(`Meta: ${meta()} g de proteína al día.`); } }
  if (el.id === 'mant') { const v = parseInt(el.value, 10); S.cfg.mant = v >= 1000 && v <= 6000 ? v : null; guardar(); render(); }
  if (el.id === 'aguaMeta') { const v = parseInt(el.value, 10); if (v >= 1 && v <= 24) { S.cfg.aguaMeta = v; guardar(); } }
  if (el.id === 'fotoInput' && el.files[0]) { try { fotoDraft = await reducir(el.files[0]); } catch (err) { aviso('No se pudo leer la foto.'); } el.value = ''; pintarFotoDraft(); }
  if (el.id === 'importInput' && el.files[0]) {
    try { const n = importar(JSON.parse(await el.files[0].text())); aviso(n ? `Importadas ${n} comidas.` : 'Nada nuevo: ya tenías todo.'); render(); }
    catch (err) { aviso('Ese archivo no es un respaldo de Comida.'); }
    el.value = '';
  }
});
window.addEventListener('storage', ev => { if (ev.key === KEY_RELOJ && tab !== 'agregar') render(); });
setInterval(() => { if (tab === 'hoy') render(); }, 60000);

// Copia sin conexión. Si llega una versión nueva, la app se recarga sola una vez para mostrarla.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const habia = !!navigator.serviceWorker.controller; let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !recargado) { recargado = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); });
  }).catch(() => {});
}
render();
