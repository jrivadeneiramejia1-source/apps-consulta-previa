// Firestore falso en memoria + localStorage (solo para pruebas locales).
const KEY = '__fs_falso';
const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const escribir = d => localStorage.setItem(KEY, JSON.stringify(d));
const oyentes = new Set();
const j = (...s) => s.join('/');
const clon = o => JSON.parse(JSON.stringify(o));
function hijos(colPath) {
  const d = leer(), pre = colPath + '/';
  return Object.keys(d).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).sort().map(k => mkSnap(k, d[k]));
}
function mkSnap(path, data) { const id = path.split('/').pop(); return { id, ref: { path, id }, exists: () => data !== undefined, data: () => data === undefined ? undefined : clon(data) }; }
function snapCol(path) { const docs = hijos(path); return { empty: !docs.length, size: docs.length, docs, metadata: { hasPendingWrites: false, fromCache: false }, docChanges: () => docs.length ? [{}] : [{}] }; }
function avisar(path) { const col = path.split('/').slice(0, -1).join('/'); oyentes.forEach(o => { if (o.path === col) setTimeout(() => o.next(snapCol(col)), 5); }); }
window.__fsFallar = window.__fsFallar || null;
const quiza = () => { if (window.__fsFallar) { const e = new Error('falla simulada'); e.code = window.__fsFallar; throw e; } };
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const collection = (fs, ...s) => ({ tipo: 'col', path: j(...s) });
export const doc = (fs, ...s) => ({ tipo: 'doc', path: j(...s), id: s[s.length - 1] });
export const query = (c) => c;
export const limit = () => ({});
export const orderBy = () => ({});
export const where = () => ({});
// Hora del servidor: en la prueba, la hora del teléfono. arrayUnion / arrayRemove se resuelven al guardar.
export const serverTimestamp = () => ({ __hora: true });
export const arrayUnion = (...v) => ({ __union: v });
export const arrayRemove = (...v) => ({ __quitar: v });
function resolver(prev, data) {
  const out = clon(data);
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__hora) out[k] = Date.now();
    else if (v && v.__union) out[k] = [...new Set([...((prev && prev[k]) || []), ...v.__union])];
    else if (v && v.__quitar) out[k] = ((prev && prev[k]) || []).filter(x => !v.__quitar.includes(x));
  }
  return out;
}
export async function getDocs(q) { await null; quiza(); return snapCol(q.path); }
export const getDocsFromServer = getDocs;
export async function getDoc(r) { await null; quiza(); return mkSnap(r.path, leer()[r.path]); }
export async function setDoc(r, data, opt) { quiza(); const d = leer(), v = resolver(d[r.path], data); d[r.path] = opt && opt.merge ? Object.assign({}, d[r.path], v) : v; escribir(d); avisar(r.path); }
export async function updateDoc(r, data) { quiza(); const d = leer(); if (!d[r.path]) { const e = new Error('No document'); e.code = 'not-found'; throw e; } d[r.path] = Object.assign({}, d[r.path], resolver(d[r.path], data)); escribir(d); avisar(r.path); }
export async function deleteDoc(r) { quiza(); const d = leer(); delete d[r.path]; escribir(d); avisar(r.path); }
export function onSnapshot(ref, opts, next, err) {
  if (typeof opts === 'function') { err = next; next = opts; }
  // window.__snapErr = 'permission-denied' | 'resource-exhausted' | 'unavailable': la lectura falla como en Firebase.
  if (window.__snapErr) { const c = window.__snapErr; setTimeout(() => err && err(Object.assign(new Error('simulado ' + c), { code: c })), 30); return () => {}; }
  const o = { path: ref.path, next }; oyentes.add(o);
  setTimeout(() => next(snapCol(ref.path)), 30);
  return () => oyentes.delete(o);
}
// window.__lotes: anota cada lote (cuántos documentos y cuántos bytes). window.__fsSoloContar: no los guarda (para lotes muy grandes).
export function writeBatch() { const ops = []; return { set(r, d, opt) { ops.push([r, d, opt]); }, update(r, d) { ops.push([r, d, 'update']); }, delete(r) { ops.push([r, null, 'delete']); }, async commit() {
  if (window.__lotes) { window.__lotes.push({ n: ops.length, bytes: ops.reduce((a, [, d]) => a + JSON.stringify(d).length, 0) }); if (window.__fsSoloContar) return; }
  for (const [r, d, opt] of ops) await (opt === 'update' ? updateDoc(r, d) : opt === 'delete' ? deleteDoc(r) : setDoc(r, d, opt));
} }; }
