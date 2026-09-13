# Arbejdsapp

En moderne, mobil-first arbejdsapp til daglig arbejdsplanlægning: dagens opgaver, gentagne rutiner, trailer-vask, drive-in kunder og historik.

## Stack

- **Next.js 16** (App Router, TypeScript, Server Actions)
- **Tailwind CSS v4** — mørkt/lyst industrielt design
- **Prisma + PostgreSQL** — rigtig database med relationer, soft delete og timestamps
- **PWA** — manifest + service worker for offline app-shell

## Kom i gang

```bash
npm install

# Sæt DATABASE_URL i .env (se .env.example)
npx prisma migrate dev
npm run db:seed

npm run dev
```

Åbn [http://localhost:3000](http://localhost:3000).

## Funktioner

- **Dashboard**: dagens status, fremgangsbar, problemer, hurtigt overblik
- **Opgaver**: opret, rediger, prioriter, checklister, gentagne rutiner (dagligt/hverdage/ugedage/ugentligt/hver 2. uge/månedligt/bestemt dato)
- **Vaskeplan**: trailere, status, vaskehistorik, noter
- **Drive-in**: hurtig registrering, smart genkendelse af nummerplade + firma, kundehistorik
- **Søgning**: på tværs af nummerplader, firmaer, trailere og opgaver
- **Kalender & statistik**: månedsoverblik og uge/måned-nøgletal
- **Noter & problemer**: hurtig registrering, synligt indtil løst

## Arkitektur

Databasen er designet til at kunne udvides med flere medarbejdere, roller og arbejdssteder uden at ændre grundstrukturen (se `prisma/schema.prisma`).

## Kendte begrænsninger / næste skridt

- Én bruger er hardkodet (`src/lib/current-user.ts`) — klar til at blive erstattet af rigtig login/roller.
- Offline-understøttelse cacher app-shell'en, men skriver ikke til en lokal kø ved tab af forbindelse — det er næste skridt for fuld offline-first support.
- Drag-and-drop er erstattet af op/ned-knapper for opgave-rækkefølge (fungerer fint på både mobil og desktop).
