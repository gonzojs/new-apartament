---
name: Mi Nuevo Apartamento
description: Identidad visual del micrositio del apartamento — cálida, editorial y poco ruido.
version: alpha
colors:
  primary: "#B85C38"
  secondary: "#8A7E76"
  bg: "#F5F1EC"
  surface: "#FFFFFF"
  text: "#1A1512"
  muted: "#8A7E76"
  border: "#E4DDD5"
  accent: "#B85C38"
  accent-soft: "#FEF0EA"
typography:
  display:
    fontFamily: Cormorant Garamond
    fontSize: 3rem
    fontWeight: 400
  body:
    fontFamily: Jost
    fontSize: 1rem
    fontWeight: 300
  label:
    fontFamily: Jost
    fontSize: 0.75rem
    fontWeight: 500
rounded:
  sm: 8px
  md: 12px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
---

## Overview

Una página única, tipo editorial, que presenta el apartamento con aire de revista y confianza. Prioridad: legibilidad, mucho aire, y un solo acento cálido (terracota) para acciones y momentos de énfasis.

## Colors

- **Fondo (bg):** lecho cálido claro, evita el blanco puro y reduce fatiga.
- **Texto (text):** marrón casi negro para buen contraste sin frialdad.
- **Acento (accent):** terracota para CTAs, enlaces y detalles; se usa con moderación.
- **Suave (accent-soft) y bordes (border):** separación sutil sin competir con el contenido.
- **Muted:** secundario para metadata y notas; nunca reemplaza al texto principal.

## Typography

- **Display / títulos:** Cormorant Garamond — voz de cabecera, sofisticada.
- **Cuerpo y UI:** Jost, peso bajo a medio; escaneable y neutra.
- **Etiquetas y caps:** mismo Jost, tamaño pequeño y trazado ligeramente más presente.

## Layout

Secciones en scroll vertical, hero a pantalla o casi, cards y bloques con padding generoso. El grid respira: pocas columnas, mucho margen, ritmo lento (no dashboard).

## Elevation & Depth

Sombras suaves en dos niveles (sm / md) para cards y contenedores flotantes. Evitar bordes duros con sombra fuerte: la profundidad es de “papel y luz”, no de neumorphism.

## Shapes

Bordes redondeados medios (12px) en superficies principales; 8px en inputs y chips. Sin esquinas completamente píldora salvo excepciones puntuales.

## Components

- **Enlace o botón primario:** fondo o borde con accent, texto legible; hover solo intensifica sutilmente.
- **Card:** surface sobre bg, sombra sm, border opcional sutil.
- **Hero:** título display, subtítulo en muted, CTA con accent claro y visible.

## Do's and Don'ts

- **Sí** usar el acento en pocas instancias; dejar que el blanco/crema haga de contraste.
- **No** mezclar familias extra ni más de dos pesos de display en un mismo bloque.
- **No** usar puro negro para texto largo; el token text ya da suficiente contraste.
