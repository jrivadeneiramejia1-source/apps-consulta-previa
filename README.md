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

## Reglas de Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /espacios/{espacio}/{coleccion}/{id} {
      allow read, write: if espacio.size() == 40
        && coleccion in ['comunidades', 'evidencias', 'equipos', 'recibidos', 'entregas', 'archivos'];
    }
  }
}
```
