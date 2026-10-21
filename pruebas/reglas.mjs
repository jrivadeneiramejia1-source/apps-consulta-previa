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
// ---------- Soporte: chat de todos y privados (identidad anónima por teléfono) ----------
const FV = firebase.firestore.FieldValue, ahora = () => FV.serverTimestamp();
const como = uid => env.authenticatedContext(uid).firestore();
const J1 = como('tel-jeiler-1'), J2 = como('tel-jeiler-2'), ANA = como('tel-ana'), LUIS = como('tel-luis');
const G = `espacios/${H}/gente`, CONV = `espacios/${H}/privados/ana__jeiler/mensajes`;
const msg = (de, texto, extra) => Object.assign({ de, texto, en: ahora(), leido: false }, extra || {});
await t('chat: sin sesión anónima no se ve la gente', assertFails(db.collection(G).get()));
await t('chat: cada persona se anota con su teléfono', (async () => {
  await assertSucceeds(J1.doc(`${G}/jeiler`).set({ nombre: 'Jeiler', uids: ['tel-jeiler-1'], visto: ahora(), creado: ahora() }));
  await assertSucceeds(ANA.doc(`${G}/ana`).set({ nombre: 'Ana', uids: ['tel-ana'], visto: ahora(), creado: ahora() }));
  await assertSucceeds(LUIS.doc(`${G}/luis`).set({ nombre: 'Luis', uids: ['tel-luis'], visto: ahora(), creado: ahora() }));
  await assertSucceeds(LUIS.collection(G).get());
})());
await t('chat: no se puede anotar a nombre de otro teléfono', assertFails(LUIS.doc(`${G}/pedro`).set({ nombre: 'Pedro', uids: ['tel-ana'], visto: ahora(), creado: ahora() })));
await t('chat: no se puede quitar el nombre a otra persona', assertFails(LUIS.doc(`${G}/jeiler`).set({ nombre: 'Jeiler', uids: ['tel-luis'], visto: ahora(), creado: ahora() })));
await t('chat: el latido (visto) lo cambia la misma persona', assertSucceeds(J1.doc(`${G}/jeiler`).update({ visto: ahora() })));
await t('chat de todos: Jeiler escribe y todos lo leen', (async () => {
  await assertSucceeds(J1.doc(`espacios/${H}/chat/m1`).set({ de: 'jeiler', nombre: 'Jeiler', texto: 'Buenos días, equipo', en: ahora() }));
  await assertSucceeds(LUIS.collection(`espacios/${H}/chat`).orderBy('en', 'desc').limit(50).get());
})());
await t('chat de todos: no se escribe a nombre de otro', assertFails(LUIS.doc(`espacios/${H}/chat/m2`).set({ de: 'jeiler', nombre: 'Jeiler', texto: 'falso', en: ahora() })));
await t('chat de todos: hora inventada no', assertFails(J1.doc(`espacios/${H}/chat/m3`).set({ de: 'jeiler', nombre: 'Jeiler', texto: 'x', en: new Date(0) })));
await t('chat de todos: mensaje vacío o de más de 2000 no', (async () => {
  await assertFails(J1.doc(`espacios/${H}/chat/m4`).set({ de: 'jeiler', nombre: 'Jeiler', texto: '', en: ahora() }));
  await assertFails(J1.doc(`espacios/${H}/chat/m5`).set({ de: 'jeiler', nombre: 'Jeiler', texto: 'a'.repeat(2001), en: ahora() }));
})());
await t('chat de todos: responder citando', assertSucceeds(ANA.doc(`espacios/${H}/chat/m6`).set({ de: 'ana', nombre: 'Ana', texto: 'Hola', en: ahora(), cita: { id: 'm1', texto: 'Buenos días, equipo', nombre: 'Jeiler' } })));
await t('chat de todos: solo quien lo escribió lo borra', (async () => {
  await assertFails(LUIS.doc(`espacios/${H}/chat/m1`).delete());
  await assertSucceeds(J1.doc(`espacios/${H}/chat/m1`).delete());
})());
await t('privado: Jeiler le escribe a Ana y ella lo lee', (async () => {
  await assertSucceeds(J1.doc(`${CONV}/p1`).set(msg('jeiler', 'Ana, ¿me ayudas con el backup?')));
  await assertSucceeds(ANA.collection(CONV).orderBy('en', 'desc').limit(50).get());
  await assertSucceeds(J1.doc(`${CONV}/p1`).get());
})());
await t('privado: Luis no puede leerlo (ni la lista ni el mensaje)', (async () => {
  await assertFails(LUIS.collection(CONV).get());
  await assertFails(LUIS.doc(`${CONV}/p1`).get());
})());
await t('privado: Luis no puede escribir en esa conversación', assertFails(LUIS.doc(`${CONV}/p2`).set(msg('luis', 'me meto'))));
await t('privado: no se escribe como la otra persona', assertFails(J1.doc(`${CONV}/p3`).set(msg('ana', 'soy Ana'))));
await t('privado: la conversación tiene que ir en orden (ana__jeiler, no jeiler__ana)', assertFails(J1.doc(`espacios/${H}/privados/jeiler__ana/mensajes/p4`).set(msg('jeiler', 'x'))));
await t('privado: Ana lo marca como leído; Jeiler no puede', (async () => {
  await assertFails(J1.doc(`${CONV}/p1`).update({ leido: true }));
  await assertSucceeds(ANA.doc(`${CONV}/p1`).update({ leido: true }));
  await assertFails(ANA.doc(`${CONV}/p1`).update({ texto: 'cambiado' }));
})());
await t('vincular: el otro teléfono de Jeiler deja un código', assertSucceeds(J2.doc(`espacios/${H}/vinculos/482913`).set({ uid: 'tel-jeiler-2', clave: 'jeiler', creado: ahora() })));
await t('vincular: el código no puede ser de otro teléfono', assertFails(LUIS.doc(`espacios/${H}/vinculos/111111`).set({ uid: 'tel-ana', clave: 'ana', creado: ahora() })));
await t('vincular: antes de vincularlo, el segundo teléfono no lee los privados', assertFails(J2.collection(CONV).get()));
await t('vincular: el primer teléfono lo agrega y el segundo ya lee', (async () => {
  await assertSucceeds(J1.doc(`espacios/${H}/vinculos/482913`).get());
  await assertSucceeds(J1.doc(`${G}/jeiler`).update({ uids: FV.arrayUnion('tel-jeiler-2') }));
  await assertSucceeds(J1.doc(`espacios/${H}/vinculos/482913`).delete());
  await assertSucceeds(J2.collection(CONV).get());
})());
await t('vincular: Luis no puede agregar su teléfono a Jeiler', assertFails(LUIS.doc(`${G}/jeiler`).update({ uids: FV.arrayUnion('tel-luis') })));
await t('salir: un teléfono se quita y deja de leer', (async () => {
  await assertSucceeds(J2.doc(`${G}/jeiler`).update({ uids: FV.arrayRemove('tel-jeiler-2') }));
  await assertFails(J2.collection(CONV).get());
})());
await t('gente: no se puede dejar a una persona sin teléfonos', assertFails(J1.doc(`${G}/jeiler`).update({ uids: [] })));

await env.cleanup();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
