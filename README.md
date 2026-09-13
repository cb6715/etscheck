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
- **☀️ Godmorgen-briefing / arbejdsassistent** (`/planlaegning`): skriv eller tal naturligt dansk om dagens arbejde ("8 vaske fra haven, 2 taget af natholdet, 3 juletræer skal ryddes op") — appen omdanner det til en struktureret arbejdsplan med mængder, nathold-attribution og "plan vs. faktisk". Se afsnittet nedenfor.
- **Opgaver**: opret, rediger, prioriter, checklister, gentagne rutiner (dagligt/hverdage/ugedage/ugentligt/hver 2. uge/månedligt/bestemt dato)
- **Vaskeplan**: trailere, status, vaskehistorik, noter
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

## Arkitektur

Databasen er designet til at kunne udvides med flere medarbejdere, roller og arbejdssteder uden at ændre grundstrukturen (se `prisma/schema.prisma`).

## Kendte begrænsninger / næste skridt

- Én bruger er hardkodet (`src/lib/current-user.ts`) — klar til at blive erstattet af rigtig login/roller.
- Offline-understøttelse cacher app-shell'en, men skriver ikke til en lokal kø ved tab af forbindelse — det er næste skridt for fuld offline-first support.
- Drag-and-drop er erstattet af op/ned-knapper for opgave-rækkefølge (fungerer fint på både mobil og desktop).
