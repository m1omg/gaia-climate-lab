GAIA CLIMATE LAB v9 — COMPLETE PACKAGE
=======================================

PLAY IMMEDIATELY (NO NPM, NO SERVER)
------------------------------------
1. Extract this ZIP.
2. Open PLAY_OFFLINE.
3. Double-click index.html.

The offline edition contains the same game logic, controls, WebGL2 renderer,
styling, presets, and climate model as the current published v9 build. It is a
client-only bundle, so the normal server-rendering shell is omitted; this does
not remove any gameplay feature.

RUN OR EDIT THE FULL SOURCE PROJECT
-----------------------------------
Requirements: Node.js 22.13 or newer and npm.

In a terminal, change into the SOURCE folder and run:

  npm ci
  npm run dev

Open the local address printed in the terminal (normally localhost:5173).

To make and run a production build:

  npm run build
  npm run start

PACKAGE CONTENTS
----------------
PLAY_OFFLINE/   Double-clickable, no-build edition
SOURCE/         Exact source snapshot of the published v9 project
VERSION.txt     Build identity

PUBLISHED VERSION
-----------------
https://gaia-climate-lab.miso93.chatgpt.site

NOTES
-----
- Extract the archive before opening index.html. Running it from inside a ZIP
  is unreliable on some operating systems.
- WebGL2 is used when available. The game falls back to its software renderer
  if WebGL2 cannot start.
- Scientific-reference links need internet access; the simulation does not.
- This is an exploratory reduced-order climate model, not a general circulation
  model or a substitute for a research-grade coupled atmosphere-ocean code.
