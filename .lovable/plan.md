
# Shopify Shop-zu-Shop Migrations-App

## Überblick
Eine externe Web-App, die es ermöglicht, ausgewählte Daten (Metaobjekte, Collections, Produkte, Blogs, Artikel, Pages) von einem Shopify-Shop zu einem anderen zu migrieren. Die App unterstützt sowohl einmalige Migration als auch wiederholte Synchronisation.

## Seiten & Funktionen

### 1. Shop-Verbindung (Setup-Seite)
- Zwei Eingabefelder für Shopify Admin API Access Tokens (Shop A = Quelle, Shop B = Ziel)
- Eingabe der Shop-URLs (z.B. `mein-shop.myshopify.com`)
- Verbindungstest-Button für beide Shops
- Anzeige von Shop-Name und Status nach erfolgreicher Verbindung

### 2. Datenübersicht & Auswahl (Hauptseite)
- Dashboard mit Tabs oder Kategorien für jeden Datentyp:
  - **Produkte** (inkl. Varianten, Bilder, Metafields)
  - **Collections** (Smart & Custom)
  - **Metaobjekte** (Metaobject Definitions & Entries)
  - **Blogs & Artikel**
  - **Pages**
- Zwei Auswahl-Modi:
  - **Bulk**: Alle Einträge eines Typs auf einmal auswählen
  - **Granular**: Einzelne Einträge aus einer durchsuchbaren/filterbaren Liste auswählen
- Vorschau der ausgewählten Daten mit Anzahl und Zusammenfassung

### 3. Migrations-Einstellungen
- **Konfliktbehandlung** als globale Einstellung pro Migration:
  - Überschreiben (existierende Daten aktualisieren)
  - Überspringen (vorhandene Daten nicht antasten)
  - Nachfragen (bei jedem Konflikt entscheiden)
- Option zum Testen (Dry Run) vor der eigentlichen Migration

### 4. Migrations-Fortschritt
- Fortschrittsanzeige pro Datentyp
- Live-Log mit Erfolgs- und Fehlermeldungen
- Zusammenfassung nach Abschluss (X erstellt, Y aktualisiert, Z übersprungen, Fehler)

### 5. Migrations-Historie
- Liste vergangener Migrationen mit Datum, Umfang und Status
- Möglichkeit, eine vorherige Migration erneut auszuführen (Sync-Funktion)

## Backend (Lovable Cloud)
- Edge Functions für die sichere Kommunikation mit der Shopify Admin API beider Shops
- Shopify Access Tokens werden serverseitig verarbeitet (nicht im Frontend gespeichert)
- Verarbeitung der Daten-Migration in Batches um API-Rate-Limits zu respektieren

## Design
- Klares, funktionales Dashboard-Design
- Fortschrittsbalken und Status-Indikatoren
- Responsive, aber primär für Desktop optimiert (Admin-Tool)
