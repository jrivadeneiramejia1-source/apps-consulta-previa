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
- `pruebas/`: banco de pruebas con Firebase falso. `node pruebas/prueba.mjs` prueba Equipos y Entregas en tema claro y oscuro.
  `node pruebas/sincronia.mjs` prueba la sincronía Entregas ↔ Equipos y la agenda de mantenimiento.

## Cómo se enlazan Entregas y Equipos
- Hoja de **devolución**: crea un pendiente en Recibidos. La hoja guarda `recibidos: { SERIAL: id }` y el pendiente guarda `hoja` y `devueltoPor`.
- Al dar **Listo** en Equipos se escoge a quién queda asignado (Bodega Riohacha, quien lo devolvió u otra persona). La hoja pasa a **Entrega** a ese nombre y guarda `devolucion: { nombre, cedula, fecha }`.
- Hoja de **entrega**: asigna el equipo y guarda `antes: { SERIAL: a quién estaba asignado }` para devolverlo si se borra la hoja.
- **Borrar** en cualquiera de las dos apps ofrece borrar también en la otra.
- Corregir una hoja solo cambia la diferencia: no repite pendientes y quita los que sobran.
- **Agenda de mantenimiento** (Equipos): `prog: { fecha, nota }` en el equipo; al hacerlo se actualiza `fechaMtto` y se agrega a `mttos`.

## Reglas de Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /espacios/{espacio}/{coleccion}/{id} {
      allow read, write: if espacio.size() == 40
        && coleccion in ['comunidades', 'evidencias', 'equipos', 'recibidos', 'entregas', 'archivos', 'avisos'];
    }
  }
}
```

## Notificaciones (Agenda de Equipos)
- `avisos/worker.js`: Cloudflare Worker **avisos-equipos** que cifra y firma (Web Push, RFC 8291 y 8292) los avisos. No guarda nada.
  En Cloudflare necesita el secreto `VAPID_D`. La parte pública de la llave está en `config.js` (`window.AVISOS`).
- Cada teléfono que activa las notificaciones queda en la colección `avisos` (nombre de la persona y su suscripción).
- Al programar un mantenimiento con **Responsable**, la app le envía el aviso a los teléfonos de esa persona.
- Pruebas: `node pruebas/worker.mjs` (cifrado y firma) y `node pruebas/avisos.mjs` (flujo en la app).
