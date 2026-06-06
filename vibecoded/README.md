# Stream Deck Editor

Grafischer Editor fuer Elgato Stream Deck Profile.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (v18 oder neuer)
- npm (wird mit Node.js installiert)

## Installation

```bash
npm install
```

## Starten

```bash
npm start
```

## Projektstruktur

```
streamdeck-editor/
├── index.html        # UI (Renderer-Prozess)
├── src/
│   ├── main.js       # Electron Hauptprozess
│   └── preload.js    # IPC-Bridge (sicherer Kontext)
├── package.json
└── .gitignore
```

## Plattformen

- **Windows**: Profile aus `%APPDATA%\Elgato\StreamDeck\ProfilesV3\`
- **macOS**: Profile aus `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/`

Der Registry-Zugriff (Geraete-Namen) ist derzeit nur unter Windows implementiert.
Unter macOS wird die entsprechende plist-Datei benoetigt (TODO).
