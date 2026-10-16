# Apps Consulta Previa

Tres apps web instalables (PWA) que funcionan en el teléfono y en el computador, sin cuenta de Claude:

- **Evidencias** (`evidencias/`): fotos y videos por comunidad y etapa.
- **Equipos** (`equipos/`): equipos recibidos, mantenimiento y backup.
- **Entregas** (`entregas/`): hojas de entrega y devolución escaneadas (PDF o fotos).

Los datos viven en Firebase (Firestore). Cada app pide una **clave de acceso** la primera vez; todos los que usen la misma clave ven los mismos datos.

## Archivos
- `config.js`: datos del proyecto de Firebase.
- `nube.js`: conexión con Firebase, pantalla de clave, copia de seguridad e instalación.
- `sw.js`: guarda la app en el teléfono para abrir sin internet.
- `comun.css`, `comun.js`, `iconos.js`, `fuentes/`: diseño compartido de Equipos y Entregas (ver `DESIGN.md`).
- `firestore.rules`: reglas de la base de datos (las mismas que hay que pegar en Firebase).
- `pruebas/`: banco de pruebas con Firebase falso. `node pruebas/prueba.mjs` prueba Equipos y Entregas en tema claro y oscuro.
  `node pruebas/sincronia.mjs` prueba la sincronía Entregas ↔ Equipos y la agenda de mantenimiento.
- `package.json`, `eslint.config.js`, `lighthouserc.cjs`, `.github/workflows/`: solo para las pruebas automáticas; las apps no se compilan.

## Pruebas automáticas
Cada vez que se sube un cambio a GitHub, **Actions** corre todo (pestaña *Actions*, en inglés "acciones"). Para correrlo en un computador:
```
npm ci
npm run lint        # revisa el código (ESLint), también el que está dentro de los index.html
npm run pruebas     # las apps en un navegador de verdad (Playwright) con Firebase falso, y la accesibilidad (axe)
npm run enlaces     # enlaces, íconos y archivos que guarda cada sw.js
npm run reglas      # reglas de Firestore en el emulador de Firebase (necesita Java)
npm run lighthouse  # velocidad, accesibilidad y buenas prácticas (solo avisa)
```

## Cómo se enlazan Entregas y Equipos
- Hoja de **devolución**: crea un pendiente en Recibidos. La hoja guarda `recibidos: { SERIAL: id }` y el pendiente guarda `hoja` y `devueltoPor`.
- Al dar **Listo** en Equipos se escoge a quién queda asignado (Bodega Riohacha, quien lo devolvió u otra persona). La hoja pasa a **Entrega** a ese nombre y guarda `devolucion: { nombre, cedula, fecha }`.
- Hoja de **entrega**: asigna el equipo y guarda `antes: { SERIAL: a quién estaba asignado }` para devolverlo si se borra la hoja.
- **Borrar** en cualquiera de las dos apps ofrece borrar también en la otra.
- Corregir una hoja solo cambia la diferencia: no repite pendientes y quita los que sobran.
- **Agenda de mantenimiento** (Equipos): `prog: { fecha, nota }` en el equipo; al hacerlo se actualiza `fechaMtto` y se agrega a `mttos`.

## Reglas de Firestore
Están en `firestore.rules` (se prueban con `npm run reglas`). En Firebase → Firestore Database → Reglas (Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /espacios/{espacio}/{coleccion}/{id} {
      allow read, write: if espacio.size() == 40
        && coleccion in ['comunidades', 'evidencias', 'equipos', 'recibidos', 'entregas', 'archivos', 'avisos', 'tareas'];
    }
  }
}
```

## Agenda de Equipos
- Colección `tareas`: `{ serial, tipo: fisico|remoto|backup, fecha, nota, resp, creadoPor, estado, hist[], hecho }`.
- Estados: pendiente → (remoto o backup) `encender` "prende el equipo" → `encendido` → `hecho`; `nopudo` deja la tarea activa con el motivo.
- Cada paso avisa a quien corresponde: al programar, al responsable; al pedir prender, a quien la programó; al prender, a quien pidió; al terminar, a quien la programó.
- Al terminar: físico actualiza `fechaMtto`, remoto `fechaRemoto`, backup `fechaBackup`, y se agrega a `mttos` del equipo.
- El equipo guarda su número de `anydesk`.
- Backup: se le conecta al equipo el disco de backup y otra persona hace la copia por AnyDesk. La tarea puede decir qué disco usar (`disco`); al terminar se guarda en qué disco quedó (`hecho.disco` y `discoBackup` del equipo) y se avisa que ya pueden desconectarlo.
- Colección `avisos`: un documento por teléfono que abrió Equipos `{ nombre, equipo, visto, sub }`. De ahí sale la lista de personas para escoger el responsable.

## Notificaciones (Agenda de Equipos)
- `avisos/worker.js`: Cloudflare Worker **avisos-equipos** que cifra y firma (Web Push, RFC 8291 y 8292) los avisos. No guarda nada.
  En Cloudflare necesita el secreto `VAPID_D`. La parte pública de la llave está en `config.js` (`window.AVISOS`).
- Cada teléfono que activa las notificaciones queda en la colección `avisos` (nombre de la persona y su suscripción).
- Al programar un mantenimiento con **Responsable**, la app le envía el aviso a los teléfonos de esa persona.
- Pruebas: `node pruebas/worker.mjs` (cifrado y firma) y `node pruebas/avisos.mjs` (flujo en la app).

## Instalar la app
- `nube.js` ofrece instalarla en tres lugares: una franja arriba (se cierra por 7 días con la X), un botón en la pantalla de la clave (lo primero que ve quien abre el enlace) y un bloque fijo en Base de datos → "Copia de seguridad y acceso".
- Android y computador con Chrome o Edge: abre el aviso del navegador. iPhone, o Android abierto desde WhatsApp: muestra los pasos (Safari → Compartir → Agregar a inicio; Chrome → ⋮ → Instalar aplicación).
- Si ya está instalada no muestra nada. Prueba: `node pruebas/instalar.mjs`.

## Registro de errores (Slack)
- `nube.js` captura los errores de código que pasan en los teléfonos (`error` y promesas sin atender) y los manda al mismo Worker, en `…/errores`.
- Va solo: app, versión, mensaje, dónde pasó, nombre de la persona, navegador y cuántas veces. Nunca la clave, la huella del espacio, correos ni datos.
- Máximo 5 errores distintos por sesión; el mismo error no se repite. Sin señal quedan en cola y se mandan al volver a abrir. Solo se envía desde GitHub Pages.
- Desde el código de la app también se puede avisar a mano: `nube.reportarError(error, 'dónde')`.
- El Worker los publica en Slack si tiene el secreto `SLACK_WEBHOOK`; sin él los acepta y no publica nada.
- También recibe los errores de **Mis Claves** (`mis-claves.jrivadeneiramejia1.workers.dev` y sus vistas previas; también `mis-claves.pages.dev`). Mis Claves solo puede mandar errores, no avisos.
- Para activarlo: en Slack crea una app → *Incoming Webhooks* (webhooks entrantes) → *Add New Webhook* (agregar webhook) → escoge el canal y copia la dirección `https://hooks.slack.com/services/…`.
  En Cloudflare → Workers → avisos-equipos → *Settings* (configuración) → *Variables and Secrets* (variables y secretos) → *Add* (agregar) → tipo *Secret* (secreto), nombre `SLACK_WEBHOOK`, valor la dirección.
- Prueba: `node pruebas/errores.mjs`.
