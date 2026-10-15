---
version: 1
name: Consulta Previa (Equipos y Entregas)
description: Herramientas de campo para soporte técnico en La Guajira. Encabezado verde petróleo, papel arena, tablero de cifras de colores que se toca para filtrar y seriales en monoespaciada. Vivas pero claras.

colors:
  encabezado: "#0A5A4E → #12806C"  # banda de marca con brillo en la esquina (oscuro: #0D3B37 → #14594F)
  arena: "#F4F1E8"            # fondo claro
  papel: "#FFFFFF"            # superficies (claro)
  arena-2: "#EEE9DC"          # superficies hundidas, notas
  linea: "#DFD8C7"
  tinta: "#14201C"            # texto (claro)
  gris: "#56615B"             # texto suave (claro)
  petroleo: "#0B7563"         # acento: acción principal, chip activo, pestaña activa, foco
  sol: "#F2A93B"              # solo insignias (cuántos faltan); texto oscuro encima
  noche: "#0A1B1C"            # fondo oscuro: petróleo profundo, nunca negro puro
  noche-sup: "#11292A"        # superficies (oscuro)
  petroleo-claro: "#3FD1B0"   # acento en oscuro
  estados:                    # solo para estados, nunca decorativos
    en-espera: naranja (#8F5200 / #F2B552)
    parcial: azul (#1D5BA6 / #8AB8F2)
    listo: verde (#136A42 / #66D69A)
    peligro: rojo (#B0281F / #FF8E84), solo errores y borrar

typography:
  familia: Bricolage Grotesque (variable 200-800, incluida en /fuentes)
  monoespaciada: JetBrains Mono 500 (seriales, fechas, cifras de tabla)
  titulo-vista: 1.55rem / 760 / ancho 92 / -0.02em
  titulo-hoja: 1.35rem / 760
  cifra-tablero: 1.9rem / 720, números tabulares
  cuerpo: 16px / 400 / 1.45
  ayuda: 0.84rem, color gris

shapes:
  controles: 12px        # campos, botones (mínimo 44px de alto)
  tarjetas: 18px
  hojas: 24px            # paneles que suben desde abajo; centrados en escritorio
  chips: 999px           # filtros (40px de alto)

icons: Phosphor regular (relleno en la pestaña activa), 1.25em, color heredado. Copiados en iconos.js para usar sin internet.
---

## Overview
Dos apps hermanas que usa un equipo pequeño en campo, casi siempre desde el teléfono y a veces sin señal.
Equipos lleva lo recibido para mantenimiento y backup; Entregas guarda las hojas firmadas y actualiza Equipos.
La interfaz prioriza leer rápido el estado de cada equipo y hacer la siguiente acción con un toque.

## Signature
El encabezado de color con la marca de cada app, y el tablero de tres cifras de colores arriba de cada lista:
cada cifra tiene su franja, su icono y cuenta hasta su valor; al tocarla filtra la lista (otra vez, la quita).
Las tarjetas llevan franja de estado a la izquierda (naranja en espera, azul a medias, verde listo)
y cada tipo de equipo tiene su placa de color con icono.

## Interacción
- Al cambiar de sección la lista entra escalonada (0,3 s). Al marcar una tarea, el botón brilla en verde.
- Las insignias saltan cuando cambia el número. Los avisos traen icono: verde si salió bien, sol si hay problema.
- Con una hoja abierta, los avisos salen arriba para no tapar Guardar.
- Todo se apaga con "reducir movimiento" del teléfono.

## Do
- Un acento (petróleo) y el sol solo para insignias. Los colores de estado solo dicen estado.
- Cada propiedad moderna (color-mix, dvh) lleva antes un valor de respaldo para teléfonos viejos.
- Tema automático (el del teléfono) con botón en el encabezado para escoger claro u oscuro; se guarda en el teléfono y lo comparten Equipos y Entregas. Probar los tres.
- Español, voz activa, segunda persona. Los errores dicen qué hacer.
- Cargas con esqueletos que imitan la lista; textos de espera con "…".
- Hojas y diálogos: foco adentro al abrir, Escape cierra solo lo de arriba, el foco vuelve al botón que la abrió.
- Avisar antes de cerrar con cambios sin guardar y antes de todo lo que no se puede deshacer.
- Áreas táctiles de 44px como mínimo (chips y segmentos 38 a 40px).

## Don't
- No guion largo, no tres puntos sueltos, no emojis ni símbolos (✓ ✕ 📷) como iconos.
- No iconos dibujados a mano.
- No `prompt()`, `confirm()` ni `alert()` del navegador: todo dentro de la app.
- No `transition: all`; solo transform, colores y sombras.
- No fuentes ni librerías de diseño desde internet: todo está en el repo para que abra sin señal.
