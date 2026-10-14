# Vagtløn

En slank, selvstændig app til tjek ind/ud og lønberegning — ingen trailere,
drive-in eller briefing, kun det der handler om arbejdstid og løn.

## Stack

- Next.js (App Router) + React
- `@netlify/database` — zero-config Postgres, provisioneres automatisk ved
  deploy. Migrationer (inkl. en engangs-seed af din bruger og dine
  lønindstillinger) ligger i `netlify/database/migrations/`.
- Ingen login endnu — én bruger pr. deployment.

## Lokal udvikling

```bash
npm install
# DATABASE_URL i .env skal pege på en lokal Postgres med migrationerne
# i netlify/database/migrations/ allerede kørt igennem (psql -f ...).
npm run dev
```

## Deploy

Netlify provisionerer databasen og kører migrationerne automatisk, så længe
`@netlify/database` er en dependency og migrationerne ligger i
`netlify/database/migrations/`. Ingen manuel database-opsætning nødvendig.
