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
export async function getDocs(q) { await null; quiza(); return snapCol(q.path); }
export const getDocsFromServer = getDocs;
export async function getDoc(r) { await null; quiza(); return mkSnap(r.path, leer()[r.path]); }
export async function setDoc(r, data, opt) { quiza(); const d = leer(); d[r.path] = opt && opt.merge ? Object.assign({}, d[r.path], clon(data)) : clon(data); escribir(d); avisar(r.path); }
export async function updateDoc(r, data) { quiza(); const d = leer(); if (!d[r.path]) { const e = new Error('No document'); e.code = 'not-found'; throw e; } d[r.path] = Object.assign({}, d[r.path], clon(data)); escribir(d); avisar(r.path); }
export async function deleteDoc(r) { quiza(); const d = leer(); delete d[r.path]; escribir(d); avisar(r.path); }
export function onSnapshot(ref, opts, next, err) {
  if (typeof opts === 'function') { err = next; next = opts; }
  const o = { path: ref.path, next }; oyentes.add(o);
  setTimeout(() => next(snapCol(ref.path)), 30);
  return () => oyentes.delete(o);
}
export function writeBatch() { const ops = []; return { set(r, d, opt) { ops.push([r, d, opt]); }, async commit() { for (const [r, d, opt] of ops) await setDoc(r, d, opt); } }; }
