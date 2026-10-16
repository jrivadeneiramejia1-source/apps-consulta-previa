// Prueba de las reglas de Firestore con el emulador de Firebase (necesita Java).
// Uso: npm run reglas   (arranca el emulador, corre esta prueba y lo apaga)
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './banco.mjs';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
let ok = 0, mal = 0;
const t = async (n, p) => { try { await p; ok++; console.log('OK    ' + n); } catch (e) { mal++; console.log('FALLA ' + n + ' ' + (e && e.message || e)); } };

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-consulta-previa',
  firestore: { rules: fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8'), host, port: Number(port) }
});
const db = env.unauthenticatedContext().firestore();
const H = 'a'.repeat(40), OTRA = 'b'.repeat(40);
const COLES = ['comunidades', 'evidencias', 'equipos', 'recibidos', 'entregas', 'archivos', 'avisos', 'tareas'];

for (const c of COLES) {
  await t(`${c}: se puede escribir, leer y borrar en un espacio`, (async () => {
    const d = db.doc(`espacios/${H}/${c}/x1`);
    await assertSucceeds(d.set({ n: 1, ñ: 'áé' }));
    await assertSucceeds(d.get());
    await assertSucceeds(db.collection(`espacios/${H}/${c}`).limit(5).get());
    await assertSucceeds(d.delete());
  })());
}
await t('no se puede crear un documento vacío', assertFails(db.doc(`espacios/${H}/equipos/vacio`).set({})));
await t('no se puede dejar vacío un documento con update', (async () => {
  const d = db.doc(`espacios/${H}/equipos/v2`);
  await assertSucceeds(d.set({ serial: 'X' }));
  await assertFails(d.update({ serial: firebase.firestore.FieldValue.delete() }));
  await assertSucceeds(d.update({ serial: 'Y', marca: 'HP' }));
  await assertSucceeds(d.delete());
})());
await t('set con merge sobre un documento existente funciona (importar "actualizar")', (async () => {
  const d = db.doc(`espacios/${H}/equipos/m1`);
  await assertSucceeds(d.set({ a: 1 }));
  await assertSucceeds(d.set({ b: 2 }, { merge: true }));
  await assertSucceeds(d.delete());
})());
await t('no se permite un documento con más de 300 campos', assertFails(db.doc(`espacios/${H}/equipos/grande`).set(Object.fromEntries(Array.from({ length: 301 }, (_, i) => ['c' + i, i])))));
await t('un trozo de archivo de 700 KB se puede guardar', (async () => {
  const d = db.doc(`espacios/${H}/archivos/e-x_0_0`);
  await assertSucceeds(d.set({ e: 'e-x', p: 0, c: 0, n: 1, d: 'A'.repeat(700000) }));
  await assertSucceeds(d.delete());
})());
await t('otra colección no se permite', assertFails(db.doc(`espacios/${H}/usuarios/x`).set({ n: 1 })));
await t('otra colección no se puede leer', assertFails(db.doc(`espacios/${H}/usuarios/x`).get()));
await t('espacio de otro largo no se permite (39)', assertFails(db.doc(`espacios/${'a'.repeat(39)}/equipos/x`).set({ n: 1 })));
await t('espacio de otro largo no se permite (41)', assertFails(db.doc(`espacios/${'a'.repeat(41)}/equipos/x`).get()));
await t('no se puede listar la raíz (espacios)', assertFails(db.collection('espacios').get()));
await t('no se puede leer el documento del espacio', assertFails(db.doc(`espacios/${H}`).get()));
await t('no se puede buscar en todos los espacios a la vez', assertFails(db.collectionGroup('equipos').get()));
await t('no se permiten subcolecciones más adentro', assertFails(db.doc(`espacios/${H}/equipos/x/fotos/1`).set({ n: 1 })));
await t('fuera de espacios no hay nada', assertFails(db.doc('equipos/x').set({ n: 1 })));
await t('otro espacio (otra clave) funciona aparte', (async () => {
  await assertSucceeds(db.doc(`espacios/${OTRA}/equipos/x`).set({ de: 'otra' }));
  const s = await assertSucceeds(db.collection(`espacios/${H}/equipos`).get());
  if (s.docs.some(d => d.data().de === 'otra')) throw new Error('se mezclaron los espacios');
})());
await env.cleanup();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
