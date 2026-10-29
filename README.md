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
- `codigos.js`: lector de códigos de barras y QR de los seriales (Equipos y Entregas).
- `firestore.rules`: reglas de la base de datos (las mismas que hay que pegar en Firebase).
- `pruebas/`: banco de pruebas con Firebase falso. `node pruebas/prueba.mjs` prueba Equipos y Entregas en tema claro y oscuro.
  `node pruebas/sincronia.mjs` prueba la sincronía Entregas ↔ Equipos y la agenda de mantenimiento.
- `package.json`, `eslint.config.js`, `lighthouserc.cjs`, `.github/workflows/`: solo para las pruebas automáticas; las apps no se compilan.

## Escáner y lector de Entregas
- `entregas/escaner.js`: la cámara del teléfono saca la foto; la app busca la hoja, la recorta y la endereza (OpenCV.js, unos 10 MB la primera vez).
  Filtros: **Documento** (blanco y negro, sin sombras, con nitidez), **Mejorado** (sin sombras ni tono de la luz, pero conserva la firma en azul y los sellos), **Gris** y **Color**.
  Peso: en Documento y Gris, si una hoja pasa del techo de su calidad (Ahorro 90 KB, Normal 160 KB, Alta 320 KB) se comprime un poco más, sin bajar del piso y sin bajar la resolución.
  En Gris el papel se limpia con una rampa suave (de 200 a 230 se aclara, desde 230 queda blanco puro): pesa casi la mitad. Se probó un corte duro en 242 y pesaba más; se probó WebP y el iPhone no lo crea y el PDF no lo acepta.
- **Foto borrosa u oscura** (v27): al revisar cada página, la app mide qué tan definidos son los bordes de las letras (|Laplaciano| / gradiente en el 1 % de bordes más fuertes, a 1000 px de ancho; no depende de cuánto texto tenga la hoja) y el brillo del papel. Si salió movida o con poca luz lo dice en amarillo y deja **Repetir** resaltado; la página igual se puede usar. Cortes medidos con las fotos de prueba (nítidas 0,034 a 0,118, borrosas 0,017 a 0,025; corte 0,026; luz: brillo menor a 140). Prueba: sección 11 de `node pruebas/escaner.mjs`.
- `entregas/lector.js`: botón **Leer** en cada página de Subir. Lee el texto impreso (Tesseract.js en español, unos 6 MB la primera vez) y llena lo que esté vacío: nombre, cédula, fecha, tipo (entrega o devolución) y seriales.
  Los seriales se comparan con los de Equipos aunque el OCR lea mal 1 de cada 5 letras. Nunca cambia lo que ya escribiste. La letra a mano casi nunca se lee.
- Subir: hasta 100 páginas a la vez; las páginas suben de a 6 al mismo tiempo. Cada página se puede mover antes o después. Al escribir el nombre, la app sugiere los equipos que esa persona tiene asignados en Equipos (un toque los agrega).
- **Compartir → Entregas** (Android, con la app instalada): desde WhatsApp, el escáner del teléfono o Archivos, al tocar Compartir aparece Entregas. Las fotos o PDF llegan a Subir como páginas. Lo declara `manifest.webmanifest` (`share_target`) y los recibe `sw.js` (GitHub Pages no puede recibir archivos), que los guarda en el teléfono y abre la app. En iPhone no existe esta función. Prueba: `node pruebas/compartir.mjs`.
- Una hoja ya guardada puede recibir más páginas: **Escanear otra página** o **Agregar foto o PDF**.
- Pruebas: `node pruebas/escaner.mjs` y `node pruebas/lector.mjs` (el OCR corre de verdad con las librerías de `node_modules`).

## Lector de códigos (Equipos y Entregas)
- `codigos.js`: lee con la cámara el código de barras o QR del serial (Code 128, Code 39, EAN, QR, Data Matrix…). Usa el lector del navegador (Chrome en Android) y, si no lo tiene (iPhone, Windows), el mismo lector hecho con ZXing, que viene dentro de la app en `lib/codigos/` (paquete `barcode-detector` 3.2.2 y `zxing-wasm` 3.1.3, licencia MIT): funciona sin internet desde la primera vez. Si esos archivos no cargan, los toma de jsDelivr.
- **La cámara abre al instante** (v27): antes esperaba a que se bajara el lector (1,5 MB) y con señal lenta parecía que la cámara no abría. Ahora la imagen sale enseguida y el lector se prepara a la vez ("Preparando el lector de códigos…").
- Si la cámara no abre, dice **por qué y qué hacer**, con **Reintentar**: permiso negado (pasos para Android, iPhone o computador), otra app usando la cámara, cámara que no responde (máximo 12 s por intento, antes podía quedarse en "Abriendo la cámara…" para siempre), app abierta dentro de WhatsApp o Facebook ("Abrir en Chrome") o sin https. Si el teléfono rechaza la resolución pedida, prueba pedidos más simples; si la cámara está ocupada, espera medio segundo y reintenta. Ya no se pide `zoom: true` al abrir: en Chrome para Android eso abre un segundo permiso ("usar y mover la cámara") y, si se cerraba o negaba, la cámara no abría. El zoom se usa cuando la cámara lo ofrece sin ese permiso. Al salir de la app la cámara se apaga y al volver se abre sola.
- Los errores de cámara que no son de permiso se mandan al registro de errores (Slack) con su nombre técnico, para saber qué pasa en cada teléfono.
- Para actualizar el lector: `npm ci` y copiar `node_modules/barcode-detector/dist/iife/ponyfill.js` y `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` a `lib/codigos/`; cambiar `CODIGOS` en `equipos/sw.js` y `entregas/sw.js` (cajón propio que no se borra con cada versión).
- Si la etiqueta tiene varios códigos (serial y número de producto), usa el serial que ya está en Equipos o deja escoger. Quita "S/N:" y saca el serial de los QR de Dell y Lenovo. Sin permiso de cámara se puede tomar una foto del código.
- Códigos pequeños: la cámara principal no enfoca a menos de 10 o 15 cm, así que el lector empieza con **zoom 2×** (el teléfono se aleja, enfoca, y el código se ve grande); hay botones 1× a 4×, **Enfocar de cerca** (enfoque manual a la distancia mínima), tocar la imagen para enfocar, **Cambiar cámara** (algunos teléfonos abren la gran angular, que enfoca mal de cerca; la escogida se recuerda) y linterna. Cada opción aparece solo si el teléfono la permite. Además se turnan tres vistas: la imagen completa y el centro agrandado 2,5 y 3 veces. Si en 6 s no lee, explica qué hacer. Prueba con cámara simulada: `node pruebas/camara.mjs` (también: lector lento, sin internet, resolución rechazada, permiso negado, cámara pegada y app abierta dentro de WhatsApp).
- Dónde: Registrar recibido, Agregar equipo, Programar tarea, las búsquedas de Recibidos y Equipos, y "Escanear serial" en cada hoja de Entregas.

## Compartir y conexión con Entregas (Equipos)
- Recibido, ficha del equipo y cada tarea de la Agenda: **Avisar por WhatsApp** (abre WhatsApp con el mensaje listo; solo se escoge el contacto) y **Copiar resumen**.
- Programar tarea: atajos de fecha (Hoy, Mañana, +3 días, +1 semana, +1 mes) y acciones rápidas: poner como responsable a quien tiene el equipo (si usa la app), pasarla a remoto si tiene AnyDesk, abrir o copiar el AnyDesk y avisarle por WhatsApp.
- La ficha del equipo muestra las hojas de entrega y devolución que tiene en Entregas; al tocar una se abre en Entregas (`entregas/?hoja=ID`).
- Prueba: `node pruebas/funciones.mjs`.

## Cuidar los datos (v29)
- **Excel de Equipos con hoja Historial**: cada mantenimiento físico, remoto y backup hecho, de la Agenda (`mttos` del equipo: quién, disco y nota) y de Recibidos (`mttoFecha`, `backupFecha`). El más reciente primero. Sirve para el informe del mes.
- **Borrar un equipo** con tareas en la Agenda ofrece quitarlas también (casilla marcada). Antes quedaban sueltas y no se podían editar. Si está en Recibidos lo dice; ese registro no se borra.
- **Espacio en Firebase** (Entregas → Base de datos): cuánto ocupan las hojas del 1 GB del plan gratis y cuántas páginas más caben, contadas con las que ya hay. Es aproximado: cada página pesa un tercio más en Firebase (base64) y se suman unos 2 KB por trozo y por hoja. Desde el 80 % la barra se pone en aviso y Subir lo dice antes de escanear.
- **Última copia** (las tres apps, en "Copia de seguridad y acceso"): dice cuándo se descargó la copia en ese teléfono; si nunca o hace 30 días o más, lo resalta. Se guarda en el teléfono (`nube_<app>_copia`): no sabe si otra persona hizo la copia.
- Prueba: `node pruebas/datos.mjs`.

## Bodega y Descargado en Entregas (v33)
- **Bodega**: una entrega a nombre de "Bodega…" no le da el equipo a nadie, se queda aquí. Esa hoja ya no dice **Entrega**: la etiqueta, el título de la hoja abierta, el campo Tipo, el Excel, el nombre del PDF y la ficha del equipo en Equipos dicen **Bodega**. Hay un filtro **Bodega** aparte; **Entregas** cuenta solo las que se dieron a una persona. Es solo cómo se muestra: el tipo guardado sigue siendo `entrega`, así que las hojas de antes (como "Bodega Riohacha") cambian solas, sin tocar los datos.
- **Descargado**: al bajar el PDF de una hoja se guarda `descargado: { por, fecha }` (la última descarga). La tarjeta muestra **Descargado**, quién y cuándo, y la hoja abierta dice "Descargada por…". Bajar el PDF no cambia `actualizado` ni `por`. En modo solo lectura no se anota.
- Prueba: `node pruebas/bodega-descarga.mjs` (pdf-lib viene de internet, así que la prueba usa uno de mentira que arma un PDF vacío).

## Aviso de «la app se actualizó» (v36)
- Cuando se publica una versión con novedades, **la primera persona que abre Equipos** le manda a todos los teléfonos con notificaciones activadas un aviso: **"Se actualizaron las apps (versión N)"** y, en el texto, lo que cambió. No se le manda a quien abrió (ya lo sabe) ni a quien no activó notificaciones.
- Las novedades salen de `version.json`: `{"v": "36", "notas": ["lo que cambió", "otra cosa"]}`. **Solo se avisa si hay `notas`**; sin ellas la actualización es en silencio. Cada nota debe ser corta (el aviso las une con " · " y se corta a 400 letras).
- La versión ya avisada queda en `avisos/_novedades` (`{ v, por, en, notas }`), así que no se repite aunque abran la app muchas personas. No cambia las reglas de Firebase ni el Worker de Cloudflare: usa el servidor de avisos que ya existe (`avisos/worker.js`).
- Si dos personas abren la app en el mismo segundo, el aviso puede llegar dos veces; en el teléfono se ve uno solo porque las dos tienen la misma etiqueta (`novedades`).
- Prueba: `node pruebas/novedades.mjs`.
- Firebase → Authentication: **Anónimo** (lo usa el chat) y **Google** (habilitado, todavía sin botón en las apps). Para usar Google en las apps hay que agregar `jrivadeneiramejia1-source.github.io` en Authentication → Configuración → Dominios autorizados.

## Historial de movimientos en Soporte (v34)
- **Equipos → Soporte → Historial de movimientos** (`equipos/historial.js`): cada cambio que alguien hace queda como una línea con **su nombre, la hora y qué cambió**. Sirve para que quien esté encargado de revisar vea lo que se hizo mientras no estaba, y diga "corrige esto".
- Se anota: agregar, editar o borrar un equipo; registrar, actualizar, dar **Listo** o borrar un recibido; programar, cambiar, hacer o quitar una tarea de la Agenda. Dice solo lo que cambió (`Marca: HP → Dell`). Varios cambios del mismo equipo hechos en unos segundos se juntan en una sola línea (por ejemplo, "Dio Listo a X" con sus detalles).
- Lo que hace otra persona suma en la **insignia de Soporte** (junto con los mensajes sin leer) y sale un aviso si tienes la app abierta. Lo que haces tú queda en la lista ("Tú") pero no avisa. Hay filtro por persona y "Ver [serial]" abre la ficha del equipo.
- No se anota: lo automático (migración de la Agenda), el Excel/copia que se importa, ni lo que se hace en Entregas.
- Todos ven todo y nadie puede editarlo. **Cada persona borra sus propios movimientos** (v35): **Borrar** en cada uno, o **Borrar mis movimientos (N)** arriba; pide confirmar y se borra para todos. Los de otras personas no se pueden borrar (las reglas lo comprueban con el teléfono, igual que en el chat). Además se **borra solo a los 30 días** (cualquier teléfono que abra la app, máximo dos veces al día; la lista ya no muestra lo de más de 30 días).
- Datos: colección `actividad` (`{ de, nombre, en, serial, titulo, lineas[] }`). **Hay que pegar las reglas nuevas** (`firestore.rules`) en Firebase → Firestore Database → Reglas; sin ellas, la app sigue igual y Soporte avisa "Falta pegar en Firebase las reglas nuevas". Necesita el inicio anónimo, igual que el chat.
- Pruebas: `node pruebas/historial.mjs` (interfaz, qué se anota, juntar cambios, limpieza, reglas faltantes) y `npm run reglas` (pruebas de las reglas nuevas, incluido borrar lo propio y no lo de otros).

## Soporte con las otras apps abiertas (v32)
- Equipos, Entregas y Evidencias comparten el almacenamiento del navegador y **una sola conexión de Firestore entre pestañas** (la lleva la que se abrió primero). Si esa no tenía el inicio de sesión anónimo del chat, Soporte mostraba **"Falta pegar las reglas"** aunque las reglas estuvieran bien, y se quitaba solo al cerrar esa pestaña. Por eso salía "a veces".
- Ahora las tres apps abren Firebase Authentication antes de Firestore (`nube.js`, `abrirAuth`) y usan el mismo usuario anónimo. Además el chat reintenta unas veces un "permiso denegado" del arranque antes de culpar a las reglas.
- También se arregló un error al abrir el chat de todos antes de que llegaran los mensajes (`marcarVistoTodos`).
- Prueba: `pruebas/chat-pestanas.mjs`, con los emuladores y la caché del navegador activada (`persistencia: true` en `FIREBASE_EMULADORES`). Corre con `npm run chat-real`.

## Tipos de tarea en la Agenda (v31)
- **Programar tarea** tiene tres opciones: **Mantenimiento físico**, **Actualización de antivirus** y **Backup y mantenimiento remoto** (esta pide el nombre del disco y, al terminarla, en cuál quedó).
- Solo cambian los nombres que se ven en la Agenda. Dentro de la base de datos siguen los mismos códigos (`fisico`, `remoto`, `backup`): las tareas ya guardadas no se tocan, y una tarea vieja de "mantenimiento remoto" ahora se lee como "Actualización de antivirus". `fechaRemoto` es la fecha de la última actualización de antivirus.
- **Recibidos no cambia**: sigue con Mantenimiento, Backup y En espera.
- Prueba: `node pruebas/tipos.mjs`.

## Cuando Firebase no deja leer (v30)
- Si Equipos o Entregas no pueden leer la base de datos, el aviso de arriba y la lista dicen **la causa**, en vez de "No hay equipos en espera" (que parecía que se había borrado todo):
  - **Reglas** (`permission-denied`): las reglas publicadas en Firebase no son las de `firestore.rules`. Se pega el archivo completo en Firestore Database → Reglas y se toca Publicar.
  - **Cupo gratis** (`resource-exhausted`): se llegó a las 50.000 lecturas al día del plan gratis. Se renueva cada madrugada; se ve en Firestore Database → Uso.
  - **Red** (`unavailable`): sin internet o una red (SENA, empresa) que bloquea Firebase.
- Un teléfono con copia guardada sigue mostrando lo último y además explica la causa.
- Entregas se quedaba en "Cargando la base de datos…" para siempre cuando fallaba la lectura; ahora se vuelve a pintar.
- Prueba: `node pruebas/sin-datos.mjs` (computador nuevo sin copia, las tres causas y un teléfono con copia). El Firestore falso falla al leer con `window.__snapErr`.

## Pruebas automáticas
Cada vez que se sube un cambio a GitHub, **Actions** corre todo (pestaña *Actions*, en inglés "acciones"). Para correrlo en un computador:
```
npm ci
npm run lint        # revisa el código (ESLint), también el que está dentro de los index.html
npm run pruebas     # las apps en un navegador de verdad (Playwright) con Firebase falso, y la accesibilidad (axe)
npm run enlaces     # enlaces, íconos y archivos que guarda cada sw.js
npm run reglas      # reglas de Firestore en el emulador de Firebase (necesita Java)
npm run chat-real   # el chat de Soporte con los emuladores de Firestore e inicio anónimo (necesita Java)
npm run lighthouse  # velocidad, accesibilidad y buenas prácticas (solo avisa)
```

## Cómo se enlazan Entregas y Equipos
- Hoja de **devolución**: crea un pendiente en Recibidos. La hoja guarda `recibidos: { SERIAL: id }` y el pendiente guarda `hoja` y `devueltoPor`.
- Al dar **Listo** en Equipos se escoge a quién queda asignado (Bodega Riohacha, quien lo devolvió u otra persona). La hoja pasa a **Entrega** a ese nombre y guarda `devolucion: { nombre, cedula, fecha }`. Si el equipo queda en **Bodega**, la hoja se ve como **Bodega** (v33).
- Hoja de **entrega**: asigna el equipo y guarda `antes: { SERIAL: a quién estaba asignado }` para devolverlo si se borra la hoja.
- **Borrar** en cualquiera de las dos apps ofrece borrar también en la otra.
- Corregir una hoja solo cambia la diferencia: no repite pendientes y quita los que sobran.
- **Agenda de mantenimiento** (Equipos): `prog: { fecha, nota }` en el equipo; al hacerlo se actualiza `fechaMtto` y se agrega a `mttos`.

## Reglas de Firestore
Están en `firestore.rules` (se prueban con `npm run reglas`). En Firebase → Firestore Database → Reglas (Rules) se pega el archivo completo.
- Leer y borrar: solo dentro de un espacio de 40 letras y en las colecciones de las apps.
- Crear y cambiar: además, el documento no puede quedar vacío ni tener más de 300 campos (evita escrituras rotas).
- El peso de cada documento lo limita Firestore (1 MiB); las reglas no tienen forma de medirlo.
- Soporte (`gente`, `chat`, `privados`, `vinculos`): solo con sesión anónima; cada quien escribe a su nombre y los privados solo los leen sus dos personas.

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

## Soporte (chat de Equipos)
Pestaña **Soporte**: un chat de todos («Soporte · Todos») y un chat privado con cada persona que ya abrió Equipos. Sale quién está conectado, «visto hace…», mensajes sin leer, responder citando, copiar y borrar los propios. En el privado sale «Enviado» y «Visto».
- **Antes de usarlo**, en Firebase → Authentication (autenticación) → Método de acceso (Sign-in method) → **Anónimo (Anonymous)** → Habilitar, y pegar el `firestore.rules` nuevo. Sin eso la pestaña explica qué falta; el resto de la app sigue igual.
- Cada teléfono recibe una identidad anónima (sin correo ni contraseña). La persona (`gente/{nombre sin tildes}`) guarda sus teléfonos en `uids` (máximo 10).
- Privados de verdad: `privados/{a__b}/mensajes` solo lo leen los teléfonos de esas dos personas (lo revisan las reglas, no la app).
- **Otro teléfono con el mismo nombre** muestra un código de 6 números; en el teléfono que ya está anotado: Soporte → **Vincular otro teléfono** y se escribe el código (`vinculos/{código}`, se borra al usarlo).
- **Salir** quita ese teléfono de la persona (si tiene otro).
- **Limpieza automática** (para no llenar el plan gratis de Firebase): el chat de todos se borra a los 7 días; los privados, 7 días después de leídos o a los 30 sin leer. La hace cualquier teléfono al abrir el chat, máximo dos veces al día; las reglas solo dejan borrar lo viejo. Si un día se acaba el cupo gratis, la pestaña lo explica y el resto de la app sigue igual.
- Los avisos usan las mismas notificaciones de la Agenda (si la persona las activó). Tocar el aviso abre ese chat (`?chat=todos` o `?chat=nombre`).
- Pruebas: `node pruebas/chat.mjs` (interfaz, con Firebase falso) y `npm run chat-real` (tres personas y un segundo teléfono contra los emuladores).

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
