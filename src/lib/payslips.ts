"use server";

// Lønseddel (payslip) upload with GENUINE field extraction — unlike
// contracts.ts, which explicitly can't do this (no AI key configured when
// that was built). This app runs on Netlify, so the AI Gateway injects
// real Anthropic credentials at RUNTIME with no API key of our own to
// configure — see ai-gateway().
//
// File bytes live in a private Netlify Blobs store ("payslips"), same
// pattern as contracts: never a public URL, never the Postgres database,
// only ever read back by server code after an ownership check.
//
// Per this app's no-faking rule: the model is explicitly told to return
// null for anything it can't actually read off the page, never to guess
// or estimate a number that isn't printed there. Every extracted field is
// shown to the user as an editable draft before anything is applied to
// their real wage settings — confirmPayslipFields is the only thing that
// writes to wage_settings, and only with whatever the user actually
// confirmed on screen.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { getStore } from "@netlify/blobs";
import { db } from "@/lib/db";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId, updateWageSettings } from "@/lib/actions";
import type { WageConfig } from "@/lib/engine";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function payslipsStore() {
  return getStore("payslips");
}

let aiClient: Anthropic | null = null;

// The gateway only activates once a project has at least one production
// deploy and isn't guaranteed to inject credentials in every environment
// (e.g. plain `next dev` without `netlify dev`) — checked at call time,
// never assumed, so a missing key degrades to the honest
// 'ai_unavailable' status instead of throwing.
function aiGatewayAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_API_KEY);
}

function ai(): Anthropic {
  if (!aiClient) aiClient = new Anthropic();
  return aiClient;
}

export type PayslipRow = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  extraction_status: string;
  extracted_fields: ExtractedPayslipFields | null;
  confirmed_fields: Record<string, unknown> | null;
  created_at: Date;
};

export type ExtractedPayslipFields = {
  taxRatePct: number | null;
  amBidragPct: number | null;
  monthlyTaxDeduction: number | null;
  atpRatePerHour: number | null;
  hourlyRate: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  notes: string | null;
};

export async function getPayslips(): Promise<PayslipRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return db().sql<PayslipRow>`
    SELECT id, filename, content_type, size_bytes, extraction_status, extracted_fields, confirmed_fields, created_at
    FROM payslips WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
}

/** Uploads one payslip and immediately attempts real extraction — unlike
 * contracts.ts's upload, which never tries. Validates type/size BEFORE
 * anything touches storage or the DB; extraction failures never block the
 * upload itself (the file is always saved even if reading it fails). */
export async function uploadPayslip(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const userId = await getUserId();
  await requireActiveAccess(userId);

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Ingen fil valgt.");
  if (file.size === 0) return fail("Filen er tom.");
  if (file.size > MAX_SIZE_BYTES) return fail("Filen er for stor (maks 10 MB).");
  if (!ALLOWED_TYPES.has(file.type)) return fail("Kun PDF, PNG eller JPG er tilladt.");

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const blobKey = `${userId}/${randomUUID()}-${safeName}`;

  const bytes = await file.arrayBuffer();
  await payslipsStore().set(blobKey, bytes, { metadata: { userId, contentType: file.type } });

  const [row] = await db().sql<{ id: number }>`
    INSERT INTO payslips (user_id, filename, content_type, size_bytes, blob_key, extraction_status)
    VALUES (${userId}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size}, ${blobKey}, 'pending')
    RETURNING id
  `;

  await extractPayslipFields(row.id, Buffer.from(bytes).toString("base64"), file.type);
  return ok({ id: row.id });
}

const EXTRACTION_PROMPT = `Du ser et billede eller en PDF af en dansk lønseddel. Find PRÆCIS de tal, der faktisk står skrevet på siden — gæt eller beregn ALDRIG et tal, der ikke direkte kan læses eller er en simpel sum/division af tal, der står der.

Mange danske lønsedler (fx Danløn) bruger en tabel med kolonnerne Tekst / Grundlag / Sats / Udbetalt / Trukket. Kig specifikt efter:
- En række "A-skat" (evt. "A-skat (Fradrag: X,XX)") — Sats-kolonnen her er typisk skatteprocenten (fx "44%"), og tallet i parentesen efter "Fradrag:" i selve rækketeksten er det månedlige skattefradrag.
- En række "AM-bidrag" — Sats-kolonnen her er typisk AM-bidrag i procent (fx "8%").
- En række "ATP af løn" eller "ATP" — Trukket-kolonnen er ATP-beløbet i kr for perioden. Divider det med det samlede antal arbejdstimer i perioden for at få kr/time — timetallet kan stå som Grundlag på samme række, eller som "Timer" i et saldo-/periodeafsnit nederst på siden.
- En række "Timeløn" — Sats-kolonnen her er timelønnen i kr/time.
- "Til udbetaling" er nettobeløbet.

Disse mønstre er almindelige, men ikke universelle — stol altid på det, der faktisk står på netop denne lønseddel, og brug IKKE disse eksempler som tal.

Svar med ren JSON (ingen markdown, ingen forklaring udenom), med nøjagtigt disse felter:
{
  "taxRatePct": tal eller null — skatteprocenten/trækprocenten, som et tal mellem 0 og 100 (fx 44 for "44%"). Kun hvis den står eksplicit angivet.
  "amBidragPct": tal eller null — AM-bidrag i procent (typisk 8). Kun hvis angivet.
  "monthlyTaxDeduction": tal eller null — det månedlige skattefradrag i kr, hvis det står angivet (ofte i parentes efter "Fradrag:" på A-skat-rækken).
  "atpRatePerHour": tal eller null — KUN hvis både et ATP-bidrag i kr for perioden OG antal arbejdstimer i samme periode står angivet på siden; beregn da ATP-kr divideret med timer. Ellers null.
  "hourlyRate": tal eller null — timeløn i kr/time, hvis angivet.
  "grossAmount": tal eller null — bruttoløn for perioden, hvis angivet.
  "netAmount": tal eller null — nettoløn (udbetalt beløb, "Til udbetaling") for perioden, hvis angivet.
  "notes": tekst eller null — én kort sætning på dansk, hvis noget er værd at bemærke (fx "ATP beregnet fra 99 kr / 153,5 timer"), ellers null.
}`;

/** Called right after upload, and re-callable to retry a failed
 * extraction. Never throws outward on a model/parsing failure — degrades
 * to 'extraction_failed' so the UI falls back to manual entry, same as
 * contracts.ts's permanent 'ai_unavailable' state, just per-attempt here
 * instead of permanent. */
export async function extractPayslipFields(id: number, base64?: string, contentType?: string): Promise<void> {
  // Ownership-checked even though this is almost always called right
  // after uploadPayslip's own check — it's also reachable directly as a
  // public RPC (every export from a "use server" file is), and an id
  // alone must never be enough to read or re-extract another user's file.
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [owned] = await db().sql<{ id: number }>`SELECT id FROM payslips WHERE id = ${id} AND user_id = ${userId}`;
  if (!owned) return;

  if (!aiGatewayAvailable()) {
    await db().sql`UPDATE payslips SET extraction_status = 'ai_unavailable' WHERE id = ${id} AND user_id = ${userId}`;
    return;
  }

  try {
    let data = base64;
    let mediaType = contentType;
    if (!data || !mediaType) {
      const [row] = await db().sql<{ blob_key: string; content_type: string }>`
        SELECT blob_key, content_type FROM payslips WHERE id = ${id} AND user_id = ${userId}
      `;
      if (!row) return;
      const bytes = await payslipsStore().get(row.blob_key, { type: "arrayBuffer" });
      if (!bytes) {
        await db().sql`UPDATE payslips SET extraction_status = 'extraction_failed' WHERE id = ${id} AND user_id = ${userId}`;
        return;
      }
      data = Buffer.from(bytes).toString("base64");
      mediaType = row.content_type;
    }

    const contentBlock: Anthropic.Messages.ContentBlockParam =
      mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg", data } };

    const message = await ai().messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: EXTRACTION_PROMPT }] }],
    });

    const textBlock = message.content.find((b): b is Anthropic.Messages.TextBlock => b.type === "text");
    if (!textBlock) throw new Error("Intet tekstsvar fra modellen.");

    // Models sometimes wrap JSON in a ```json fence despite instructions —
    // strip it rather than fail outright on otherwise-valid output.
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as Partial<ExtractedPayslipFields>;

    const fields: ExtractedPayslipFields = {
      taxRatePct: typeof parsed.taxRatePct === "number" ? parsed.taxRatePct : null,
      amBidragPct: typeof parsed.amBidragPct === "number" ? parsed.amBidragPct : null,
      monthlyTaxDeduction: typeof parsed.monthlyTaxDeduction === "number" ? parsed.monthlyTaxDeduction : null,
      atpRatePerHour: typeof parsed.atpRatePerHour === "number" ? parsed.atpRatePerHour : null,
      hourlyRate: typeof parsed.hourlyRate === "number" ? parsed.hourlyRate : null,
      grossAmount: typeof parsed.grossAmount === "number" ? parsed.grossAmount : null,
      netAmount: typeof parsed.netAmount === "number" ? parsed.netAmount : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };

    await db().sql`
      UPDATE payslips SET extraction_status = 'extracted', extracted_fields = ${JSON.stringify(fields)}::jsonb
      WHERE id = ${id} AND user_id = ${userId}
    `;
  } catch {
    // Never surfaces the raw error to the user, never invents a fallback
    // number — just marks the attempt failed so the UI offers manual entry.
    await db().sql`UPDATE payslips SET extraction_status = 'extraction_failed' WHERE id = ${id} AND user_id = ${userId}`;
  }
}

/** Saves exactly what the user confirmed on screen (which may differ from
 * what was extracted, if they corrected something) as the record of truth
 * for this payslip, AND applies the subset that maps to real wage
 * settings — the only path that ever writes to wage_settings from here. */
export async function confirmPayslipFields(id: number, fields: Record<string, unknown>): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [existing] = await db().sql<{ id: number }>`SELECT id FROM payslips WHERE id = ${id} AND user_id = ${userId}`;
  if (!existing) return fail("Lønsedlen findes ikke.");

  await db().sql`
    UPDATE payslips SET confirmed_fields = ${JSON.stringify(fields)}::jsonb WHERE id = ${id} AND user_id = ${userId}
  `;

  const update: Partial<WageConfig> = {};
  if (typeof fields.taxRatePct === "number") update.taxRatePct = fields.taxRatePct / 100;
  if (typeof fields.amBidragPct === "number") update.amBidragPct = fields.amBidragPct / 100;
  if (typeof fields.monthlyTaxDeduction === "number") update.monthlyTaxDeduction = fields.monthlyTaxDeduction;
  if (typeof fields.atpRatePerHour === "number") update.atpRatePerHour = fields.atpRatePerHour;
  if (typeof fields.hourlyRate === "number") update.hourlyRate = fields.hourlyRate;

  if (Object.keys(update).length > 0) {
    await updateWageSettings(update);
  }
  return ok(undefined);
}

export async function deletePayslip(id: number): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [row] = await db().sql<{ blob_key: string }>`SELECT blob_key FROM payslips WHERE id = ${id} AND user_id = ${userId}`;
  if (!row) return fail("Lønsedlen findes ikke.");
  await payslipsStore().delete(row.blob_key);
  await db().sql`DELETE FROM payslips WHERE id = ${id} AND user_id = ${userId}`;
  return ok(undefined);
}
