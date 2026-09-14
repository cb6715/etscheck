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
- **💰 Tjek ind/ud + live løn**: bjælke i toppen af appen — tjek ind når du møder, og se din nettoløn tikke opad hvert sekund du er på arbejde (pauser, nattillæg og 37-timers overtid regnes automatisk med). Se afsnittet nedenfor.
- **☀️ Godmorgen-briefing / arbejdsassistent** (`/planlaegning`): skriv eller tal naturligt dansk om dagens arbejde ("8 vaske fra haven, 2 taget af natholdet, 3 juletræer skal ryddes op") — appen omdanner det til en struktureret arbejdsplan med mængder, nathold-attribution og "plan vs. faktisk". Se afsnittet nedenfor.
- **Opgaver**: opret, rediger, prioriter, checklister, gentagne rutiner (dagligt/hverdage/ugedage/ugentligt/hver 2. uge/månedligt/bestemt dato)
- **Vaskeplan**: trailere, status, vaskehistorik, noter, firma (DFDS/DSV) sat på traileren og forudvalgt ved vask (plombe-nr. for DFDS), 📷 tag et billede af traileren for at genkende trailernummer/nummerplade automatisk (kører helt lokalt i browseren — se afsnittet nedenfor)
- **Drive-in**: hurtig registrering, smart genkendelse af nummerplade + firma, kundehistorik
- **Søgning**: på tværs af nummerplader, firmaer, trailere og opgaver
- **Kalender & statistik**: månedsoverblik, uge/måned-nøgletal, og dagens briefing vist i kalenderens dagsvisning
- **Noter & problemer**: hurtig registrering, synligt indtil løst

## Godmorgen-briefing / arbejdsassistent

`/planlaegning` er et lille chat-interface ("Din arbejdsassistent") hvor du skriver eller taler (mikrofon via Web Speech API, dansk) om dagens arbejde i almindeligt sprog. Beskeden bliver tolket af `src/lib/ai/parse-briefing.ts` til strukturerede handlinger (opret mængde-opgave, forøg total, registrer udført arbejde m. hold-attribution, marker kategori færdig, opret almindelig opgave) som opdaterer de samme `Task`-rækker som resten af appen bruger — der er ingen parallel datamodel.

To lag af forståelse:
- **Uden `ANTHROPIC_API_KEY`**: en deterministisk, håndbygget dansk regelmotor (`rule-based-parser.ts`) genkender tal (også talord som "otte", "to", "tre"), kategori-synonymer, nathold/daghold, og verber for "udført" vs. "skal laves". Den er ikke en demo — den forstår rent faktisk alle eksemplerne fra kravspecifikationen.
- **Med `ANTHROPIC_API_KEY` sat** (se `.env.example`): beskeden sendes i stedet til Claude med et struktureret værktøjs-kald (`claude-parser.ts`), som giver friere, mere åben sprogforståelse. Regelmotoren er automatisk fallback hvis kaldet fejler.

Store, tvetydige beskeder (typisk den første morgenbriefing) vises som en bekræftelseskort ("Jeg tror, du mener...") før noget gemmes; små, entydige opdateringer ("Jeg har taget 2 mere") anvendes med det samme. Mangler AI'en en oplysning (fx et antal), stiller den ét opklarende spørgsmål og husker konteksten til dit næste svar.

**Afslut arbejdsdag** (🌙-knappen på `/planlaegning`) viser planlagt vs. færdigt for alt i dag (både mængde-opgaver og almindelige opgaver), og lader dig pr. restopgave vælge "Flyt til i morgen", "Ikke nødvendig" eller "Afslut alligevel".

## Trailer-scanning (kamera → tekstgenkendelse)

"Tag billede af trailer" i tilføj-trailer-formularen bruger [Tesseract.js](https://github.com/naptha/tesseract.js) — en almindelig, gratis OCR-motor der kører 100% i browseren via WebAssembly. Ingen AI-API, ingen server-kald, ingen omkostning: billedet forlader aldrig telefonen, det læses ind i et `<canvas>`, tekstgenkendelsen kører lokalt, og billedet kasseres med det samme.

Worker-scriptet, WASM-motoren og det engelske tegnsæt (`public/tesseract/`) er hostet direkte i appen i stedet for hentet fra en ekstern CDN ved brug — det gør funktionen mere robust (virker selvom en CDN er nede) og sikrer at versionerne altid matcher. Genkendt tekst tolkes af `src/lib/trailer-ocr.ts`: finder et dansk nummerplade-mønster og et 3-6-cifret trailernummer, og gætter DSV som firma hvis nummeret starter med "500" (alt er stadig frit redigerbart før du gemmer).

## Tjek ind/ud + live løn

Bjælken i toppen af appen (`src/components/wage/wage-bar.tsx`) lader dig tjekke ind/ud, og tæller din nettoløn op live med et sekunds mellemrum mens du er tjekket ind. Beregningen (`src/lib/wage/engine.ts`) er ren, testet matematik uden nogen server-afhængighed i selve tælleren:

- **Grundløn** kr/time, med **overtidstillæg** når ugens betalte timer overstiger tærsklen (default 37 t/uge — sporet på tværs af tidligere afsluttede vagter denne uge).
- **Aftentillæg** i det konfigurerede tidsrum (default 17:00–05:00), som lægges oveni evt. overtidstillæg.
- En daglig **ulønnet pause** (default 12:00–12:30) trækkes automatisk fra og tæller ikke med.
- **Skat**, i samme rækkefølge som en rigtig lønseddel: **ATP-bidrag** (kr/time) trækkes først fra bruttoen; **AM-bidrag** (8%) beregnes af resten; et **skattefradrag** pr. lønperiode gør at de første kr i perioden kun rammes af ATP+AM-bidrag, hvorefter resten beskattes med skatteprocenten. Sporet på tværs af tidligere sessioner i **lønperioden** (ikke kalendermåneden — periodens datoer sættes under Indstillinger), så tælleren skifter til efter-fradrag-satsen på det rigtige sekund, og genberegnes automatisk hvis en session tilføjes ude af kronologisk rækkefølge.

Alle tal er dine egne og redigeres under **Indstillinger → Løn** (inkl. en genvej til at logge tidligere ugers timer bagudrettet, og en historik over dem). Da appen kun har én bruger, er dette en personlig lommeregner, ikke en officiel lønseddel — men både satserne og beregningsrækkefølgen er kalibreret mod en rigtig Danløn-lønseddel og matcher den til øre-niveau.

## Deploy til Netlify

Build-kommandoen (`npm run netlify:build`, sat i `netlify.toml`) kører `prisma generate` → `prisma migrate deploy` (kun hvis en database-URL er tilgængelig) → `next build`. Databasen findes automatisk via enten `DATABASE_URL` eller Netlify DB's `NETLIFY_DATABASE_URL` (se `src/lib/resolve-database-url.ts`) — intet at rette i koden uanset hvilken løsning der bruges.

1. **Forbind repoet**: i Netlify → *Add new site → Import an existing project → GitHub* → vælg `cb6715/etscheck`, branch `main`. Netlify genkender Next.js automatisk.
2. **Database**:
   - Nemmest: aktivér *Netlify DB* (Neon) for sitet under *Extensions* — den bliver auto-provisioneret på første deploy, og build-scriptet finder den selv.
   - Alternativt: sæt din egen `DATABASE_URL` under *Site configuration → Environment variables*.
3. Første deploy uden database klar bygger stadig igennem (migrationer springes bare over med en advarsel i build-loggen) — kør blot en ny deploy, når databasen er tilgængelig, så migrationerne slår igennem.
4. Valgfrit: sæt `ANTHROPIC_API_KEY` som miljøvariabel for at give Godmorgen-briefingen rigtig Claude-baseret sprogforståelse.

## Arkitektur

Databasen er designet til at kunne udvides med flere medarbejdere, roller og arbejdssteder uden at ændre grundstrukturen (se `prisma/schema.prisma`).

## Kendte begrænsninger / næste skridt

- Én bruger er hardkodet (`src/lib/current-user.ts`) — klar til at blive erstattet af rigtig login/roller.
- Offline-understøttelse cacher app-shell'en, men skriver ikke til en lokal kø ved tab af forbindelse — det er næste skridt for fuld offline-first support.
- Drag-and-drop er erstattet af op/ned-knapper for opgave-rækkefølge (fungerer fint på både mobil og desktop).
