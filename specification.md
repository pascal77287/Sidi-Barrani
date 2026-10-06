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

## 3. Spielablauf und Bieten

### 3.1. Spiel starten
- Der Ersteller kann das Spiel von der Lobby aus starten.
- Nach dem Start wird die Biet-Oberfläche für alle Spieler aktiviert.

### 3.2. Bietvorgang
- Die Spieler können in beliebiger Reihenfolge bieten oder passen.
- Das Interface schlägt automatisch den nächsthöheren gültigen Wert basierend auf dem aktuellen Höchstgebot vor.
- Gebote werden in Echtzeit übermittelt und sind sofort für alle anderen Spieler sichtbar.

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
- **Design (Jass-Farben)**:
  - Eicheln: Grün
  - Schellen: Gelb/Gold
  - Schilten: Blau
  - Rosen: Rot
  - Obeabe/Uneufe: Grau / Neutral
