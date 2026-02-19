# Shrymp Migrator

Shopify Shop-zu-Shop Datenmigration — kopiere Daten von Shop A nach Shop B per Knopfdruck.

## Features

- Produkte
- Blog-Beiträge & Blogs
- Collections
- Pages
- Metaobjekt-Definitionen inkl. Metaobjekte
- Metafeld-Definitionen

## Datenschutz

Es werden **keinerlei Daten gespeichert** — keine Keys, keine URLs, keine Shop-Daten. Alles läuft nur im Browser-Speicher und ist nach dem Schließen des Tabs weg.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Supabase Edge Functions (Shopify API Proxy)
- Zustand (State Management)

## Lokale Entwicklung

```sh
git clone <REPO_URL>
cd migrator.shrymp.de
npm install
npm run dev
```

## Lizenz

MIT
