# Sidi Barrani – Biet-Hilfe

Eine mobile Web-App, die beim Jassspiel **Sidi Barrani** die Bietphase unterstützt. Alle Spielerinnen und Spieler öffnen die App auf dem Smartphone. Gebote werden in Echtzeit an alle übertragen, und jede Person sieht jederzeit, wer was geboten hat.

## Funktionen

- **Spiel eröffnen oder beitreten:** mit einem 4-stelligen Code, Einladungslink oder QR-Code
- **4 oder 6 Spieler:** Der Ersteller legt in der Lobby die Sitzreihenfolge fest und startet das Spiel
- **Bieten reihum:** in der festgelegten Reihenfolge. Mit jeder neuen Bietrunde beginnt die nächste Person der Liste
- **Gebote:** Spielart (Rosen, Eicheln, Schellen, Schilten, Obeabe, Uneufe) und Wert (10–150 oder Match) oder Passen
- **Kompletter Verlauf:** Alle Gebote sind direkt beim jeweiligen Spieler sichtbar, mit ihrer Reihenfolge
- **Zurücknehmen:** Das eigene Gebot lässt sich zurücknehmen, solange die nächste Person noch nicht gehandelt hat
- **Ende der Bietrunde:** Die Runde ist entschieden, wenn nach dem Höchstgebot alle anderen gepasst haben oder Match geboten wurde. Unter 90 Punkten wird nicht gespielt

Die vollständigen Regeln stehen in [specification.md](specification.md).

## Technik

- **Frontend:** React, TypeScript, Tailwind CSS (Vite)
- **Backend:** Node.js mit Express und Socket.IO
- **Spielregeln:** in `src/rules.ts`, Client und Server nutzen dasselbe Modul
- **Daten:** nur im Arbeitsspeicher des Servers. Spiele werden nach 24 Stunden Inaktivität gelöscht und gehen bei einem Neustart verloren

## Installation

### Voraussetzungen

- [Node.js](https://nodejs.org/) Version 24 (siehe `.node-version`)
- Git

### Projekt einrichten

```bash
git clone https://github.com/pascal77287/Sidi-Barrani.git
cd Sidi-Barrani
npm install
```

### Entwicklung

```bash
npm run dev
```

Die App läuft dann unter http://localhost:3000.

Im Entwicklungsmodus ist der Server nur auf dem eigenen Rechner erreichbar. Um auf dem Smartphone im selben WLAN zu testen, `HOST` setzen und die IP-Adresse des Rechners als erlaubten Origin angeben:

```bash
# macOS / Linux
HOST=0.0.0.0 ALLOWED_ORIGINS=http://192.168.1.10:3000 npm run dev
```

```powershell
# Windows PowerShell
$env:HOST="0.0.0.0"; $env:ALLOWED_ORIGINS="http://192.168.1.10:3000"; npm run dev
```

`192.168.1.10` durch die eigene IP-Adresse ersetzen. Die App dann auf dem Handy unter `http://<IP-Adresse>:3000` öffnen.

### Produktion

```bash
npm run build
npm start
```

Der Server startet ohne weitere Angaben im Produktionsmodus und lauscht auf Port 3000.

Für den Betrieb im Internet die App hinter einen Reverse Proxy mit HTTPS stellen (z.B. nginx, Caddy oder Cloud Run). Einige Funktionen wie „Bildschirm wach halten“ und „Link teilen“ funktionieren im Browser nur über HTTPS.

### Umgebungsvariablen

| Variable | Beschreibung | Standard |
|---|---|---|
| `PORT` | Port des Servers | `3000` |
| `HOST` | Netzwerk-Interface | `127.0.0.1` (Entwicklung), `0.0.0.0` (Produktion) |
| `APP_URL` | Öffentliche URL der App, z.B. `https://sidi.example.ch`. Wird für HTTPS-Umleitungen verwendet und als Origin erlaubt | – |
| `ALLOWED_ORIGINS` | Weitere erlaubte Origins für Socket.IO, kommagetrennt | – |

Eine Vorlage steht in `.env.example`. Die Variablen werden aus der Umgebung gelesen. Eine `.env`-Datei wird nicht automatisch geladen.

## Nützliche Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver (Frontend mit Hot Reload, Server-Änderungen brauchen einen Neustart) |
| `npm run build` | Frontend und Server für die Produktion bauen |
| `npm start` | Gebaute App starten |
| `npm run lint` | TypeScript-Typprüfung |
