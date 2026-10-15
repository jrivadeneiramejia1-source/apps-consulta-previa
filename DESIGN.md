---
version: 1
name: Consulta Previa (Equipos y Entregas)
description: Herramientas de campo para soporte técnico en La Guajira. Papel arena, verde petróleo como único acento, tarjetas grandes para el dedo y seriales en monoespaciada. Claras, rápidas y sin adornos.

colors:
  arena: "#F5F2EA"            # fondo claro
  papel: "#FFFFFF"            # superficies (claro)
  arena-2: "#ECE8DD"          # superficies hundidas, notas
  linea: "#DCD6C8"
  tinta: "#17201C"            # texto (claro)
  gris: "#59635D"             # texto suave (claro)
  petroleo: "#0D6B5B"         # único acento: acción principal, pestaña activa, foco
  noche: "#0E1412"            # fondo oscuro
  noche-sup: "#161E1B"        # superficies (oscuro)
  petroleo-claro: "#4CC3A7"   # acento en oscuro
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
El tablero de tres cifras arriba de cada lista y las tarjetas con franja de estado a la izquierda
(naranja en espera, azul a medias, verde listo). Cada tipo de equipo tiene su placa de color con icono.

## Do
- Un solo acento (petróleo). Los colores de estado solo dicen estado.
- Tema automático claro y oscuro; probar ambos.
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
