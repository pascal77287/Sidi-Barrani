# Spezifikation: Sidi Barrani Biet-Hilfe

Dieses Dokument beschreibt die Spezifikationen für die Webanwendung "Sidi Barrani Biet-Hilfe".

## 1. Kernfunktionalität

Die Anwendung ist eine mobile Webseite, die Spieler des Kartenspiels "Sidi Barrani" während der Bietphase unterstützt. Sie bietet eine zentrale Echtzeit-Plattform, um Gebote abzugeben und anzuzeigen.

## 2. Spiel-Erstellung und Lobby

### 2.1. Spiel erstellen
- Ein Spieler kann eine neue Spielrunde eröffnen.
- Bei der Erstellung wird ein eindeutiger, 4-stelliger Code aus Zahlen und Kleinbuchstaben generiert.
- Der Spieler, der das Spiel erstellt, wird als "Ersteller" gekennzeichnet.

### 2.2. Spiel beitreten
- Auf der Startseite wählt der Spieler zwischen "Eröffnen" und "Beitreten".
- Beim **Eröffnen**: Nur Angabe des Namens erforderlich.
- Beim **Beitreten**: Angabe des Namens und des 4-stelligen Spiel-Codes erforderlich.
- Die Eingabefelder sind modular und werden erst nach Auswahl des Modus angezeigt.

### 2.3. Lobby
- Vor dem Spielstart werden alle verbundenen Spieler in einer Lobby angezeigt.
- Die Spielerliste ist für alle Teilnehmer sichtbar.
- Der Ersteller des Spiels ist markiert.
- Gespielt wird mit **4 oder 6 Personen**. Der Ersteller kann das Spiel nur bei genau 4 oder 6 Spielern starten.
- Nach dem Start kann niemand mehr beitreten. Wer die Lobby vor dem Start verlässt, gibt seinen Platz frei.
- Der Ersteller legt vor dem Start die **Reihenfolge** der Spieler fest (Sitzordnung am Tisch). Nach dem Start ist sie fix.

## 3. Spielablauf und Bieten

### 3.1. Spiel starten
- Der Ersteller kann das Spiel von der Lobby aus starten.
- Nach dem Start wird die Biet-Oberfläche für alle Spieler aktiviert.

### 3.2. Bietvorgang
- Geboten wird **strikt reihum** in der festgelegten Reihenfolge. Jedes Gebot und jeder Pass ist ein Zug.
- Die erste Bietrunde beginnt Spieler 1. Mit jeder neuen Bietrunde **rotiert** der Beginn um einen Platz.
- Solange der nächste Spieler noch nicht gehandelt hat, kann ein Spieler sein Gebot (oder seinen Pass) zurücknehmen und neu setzen.
- **Passen** gilt nur für den Moment: Wer gepasst hat, darf später wieder bieten.
- Jedes Gebot muss höher sein als das aktuelle Höchstgebot.
- Das Interface schlägt automatisch den nächsthöheren gültigen Wert basierend auf dem aktuellen Höchstgebot vor.
- Gebote werden in Echtzeit übermittelt und sind sofort für alle anderen Spieler sichtbar.
- Alle Gebote bleiben jederzeit sichtbar, jeweils direkt beim Spieler und mit ihrer Reihenfolge.

### 3.2a. Ende der Bietrunde
- Die Bietrunde ist entschieden, wenn nach dem Höchstgebot alle anderen gepasst haben oder jemand **Match** bietet.
- Gespielt wird nur ab **90 Punkten**. Liegt das Höchstgebot darunter und passen alle anderen, ist die Runde beendet und es wird nicht gespielt.
- Die Regeln werden im Client und auf dem Server geprüft (gemeinsames Modul `src/rules.ts`).

### 3.3. Gebots-Komponenten
Ein Gebot besteht aus:
- **Farbe/Spielart**: 
  - Farben (Schweizer Jasskarten): Rosen, Eicheln, Schellen, Schilten
  - Spielarten: Obeabe, Uneufe
- **Wert**:
  - Ein Vielfaches von 10 (10 bis 150).
  - Das Höchstgebot "Match" (entspricht 157 Punkten).
- **Passen**: Ermöglicht es, kein Gebot abzugeben. "Passe" wird im Verlauf angezeigt.

### 3.4. Neue Bietrunde
- Der Ersteller kann jederzeit eine neue Bietrunde starten.
- Dadurch werden alle aktuellen Gebote gelöscht und die Runde beginnt von vorne.

## 4. Technische Umsetzung

- **Architektur**: Client-Server-Modell
- **Kommunikation**: Echtzeit-Kommunikation über WebSockets via socket.io (mit Polling-Fallback).
- **Frontend**: React mit TypeScript.
- **Sicherheit**:
  - Unterstützung für HTTPS/SSL (WSS für WebSockets) über Reverse Proxy.
  - Automatische Umleitung von HTTP auf HTTPS in der Produktionsumgebung.
- **Backend**: Node.js mit Express und socket.io.
- **Persistenz**:
  - Daten werden flüchtig im RAM gespeichert.
  - Inaktive Spiele werden nach **24 Stunden** automatisch gelöscht.
- **Design**:
  - Mobile first: Bedienelemente in der Daumenzone unten, Info-Box mit dem Höchstgebot oben.
  - Akzentfarbe Salbei (#4F7068), Farbwerte als Tokens in `src/index.css`.
  - Jass-Farben der Spielarten-Buttons:
    - Eicheln: Grün
    - Schellen: Gelb/Gold
    - Schilten: Blau
    - Rosen: Rot
    - Obeabe/Uneufe: Grau / Neutral
