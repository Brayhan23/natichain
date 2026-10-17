# NatiChain — Guía de estilo visual

> **Concepto:** la alcancía de marrano de barro paisa. Cálido, artesanal y cercano: se ve como algo hecho en Medellín, no como una plantilla genérica de cripto.
> **Lema:** La natillera donde nadie se vuela con la plata.

## 1. Paleta de colores

| Rol | Nombre | HEX | Uso |
|---|---|---|---|
| Primario | **Barro** | `#C2532B` | Botón principal, cuerpo del marrano, acentos |
| Primario oscuro | **Barro quemado** | `#8E3A1C` | Patas, oreja, enlaces, rayas de la barra de progreso |
| Primario claro | **Barro claro** | `#F2C9B0` | Brillos del barro |
| Acento | **Oro de diciembre** | `#E8A83A` | Botón "Aportar", subrayado del titular, monedas, cierre |
| Acento claro | **Oro claro** | `#FBE3B0` | Resúmenes, sellos, etiqueta "Tú" |
| Fondo | **Crema** | `#FBF3E4` | Fondo general, con textura de puntos |
| Superficie | **Papel** | `#FFFAF0` / `#F4E6CC` | Tarjetas; las tarjetas tipo cuaderno llevan renglones |
| Texto | **Café** | `#2B1A12` | Texto, bordes y sombras |
| Texto secundario | **Café suave** | `#6B5446` | Ayudas y datos secundarios |
| Éxito | **Verde** | `#2F6B4F` / `#D7EADF` | Estado "Abierta", "Reclamar mi diciembre" |
| Bloqueo | **Rojo sello** | `#B23A2E` | Sello "BLOQUEADO", "Nadie puede sacar plata" |

**Proporción sugerida:** 60% crema y papel, 25% café (texto y bordes), 10% barro, 5% oro.

## 2. Tipografía

| Uso | Fuente | Peso |
|---|---|---|
| Títulos y cifras grandes | **Fraunces** (serif con carácter, Google Fonts) | 700–800 |
| Texto e interfaz | **DM Sans** (Google Fonts) | 400 / 500 / 700 |

- Los títulos llevan un tracking ajustado (-0.02em) y un interlineado compacto (1.05).
- Las cifras usan números tabulares, para que el saldo y la cuenta regresiva no "bailen".
- El titular resalta la frase clave con un **subrayado de marcador oro**.

## 3. Lenguaje visual

- **Bordes gruesos** de 2px en café sobre botones, tarjetas, campos y chips.
- **Sombras sólidas desplazadas** (4–6px abajo y a la derecha, sin desenfoque). Dan un aspecto artesanal, como de sello o recortable.
- **Esquinas:** 14px en las tarjetas y forma de píldora en botones y chips.
- **Sin degradados morados ni efecto vidrio**, para alejarse de la estética genérica de cripto.
- **Texturas sutiles:** el fondo lleva puntos tipo papel y las tarjetas de reglas llevan renglones de cuaderno de natillera.
- **Iconos** de línea minimalistas (Heroicons outline), de trazo uniforme y en café.

## 4. Componentes clave

| Componente | Descripción |
|---|---|
| **Marrano** | Alcancía SVG ilustrada que **se llena de oro** según el saldo frente a la meta |
| **Cuenta regresiva** | Bloques café con números crema: días, horas, min, seg |
| **Monedas de cuotas** | Círculos que se llenan de oro con cada cuota pagada |
| **Sello BLOQUEADO** | Estampa roja rotada que aparece si alguien intenta sacar la plata antes del cierre (momento wow de la demo) |
| **Moneda cayendo** | Animación al aportar: la moneda cae en la alcancía |
| **Barra de progreso** | Rayas diagonales barro / barro quemado |

## 5. Movimiento

- Al pasar el mouse, los botones se elevan 1px. Al hacer clic, se "hunden" y la sombra desaparece, como un botón físico.
- Los modales entran con un rebote suave y el sello con un golpe de escala.
- Se respeta `prefers-reduced-motion`: sin animaciones para quien las desactive.

## 6. Voz y tono

- Español colombiano cercano: "¡Llegó diciembre!", "Reclamar mi diciembre", "Tengo una calamidad".
- Sin jerga técnica en la interfaz: "Aportar", no "Enviar transacción".
- Los errores se explican en lenguaje de persona: "Cancelaste la firma en MetaMask. No pasó nada."

## 7. Reglas para no romper el estilo (para Claude Code)

1. No cambiar la paleta, las fuentes, los bordes ni las sombras. Usar solo las variables `--barro`, `--oro`, `--cafe`, etc. de `styles/natichain.css`.
2. No usar emojis en la interfaz; usar Heroicons outline (`@heroicons/react/24/outline`).
3. Las clases nuevas llevan el prefijo `nc-` y van en `styles/natichain.css`.
4. Mantener la interfaz en español colombiano y sin jerga técnica.
