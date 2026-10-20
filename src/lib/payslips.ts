"use server";

// Lønseddel (payslip) upload with field extraction done by PLAIN CODE —
// no AI/LLM call. A PDF's text layer is pulled out with pdf-parse (pure
// JS, wraps Mozilla's pdf.js, no native deps — runs fine in a Netlify
// Function), then parsed with fixed regex patterns calibrated against a
// real Danløn-format payslip (Tekst/Grundlag/Sats/Udbetalt/Trukket table,
// monthly fradrag embedded in the A-skat row's own label text). A PDF from
// a different payroll system, or a photographed/scanned payslip with no
// text layer, simply won't match these patterns — extraction then yields
// nulls rather than a fabricated guess, same honest fallback contracts.ts
// already uses for its permanently-unavailable state.
//
// File bytes live in a private Netlify Blobs store ("payslips"), same
// pattern as contracts: never a public URL, never the Postgres database,
// only ever read back by server code after an ownership check.
//
// Every extracted field is shown to the user as an editable draft before
// anything is applied to their real wage settings — confirmPayslipFields
// is the only thing that writes to wage_settings, and only with whatever
// the user actually confirmed on screen.

import { randomUUID } from "crypto";
import { getStore } from "@netlify/blobs";
import { PDFParse } from "pdf-parse";
import { db } from "@/lib/db";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId, updateWageSettings } from "@/lib/actions";
import type { WageConfig } from "@/lib/engine";
import { parsePayslipText, type ExtractedPayslipFields } from "@/lib/payslip-parser";

export type { ExtractedPayslipFields } from "@/lib/payslip-parser";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function payslipsStore() {
  return getStore("payslips");
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

export async function getPayslips(): Promise<PayslipRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return db().sql<PayslipRow>`
    SELECT id, filename, content_type, size_bytes, extraction_status, extracted_fields, confirmed_fields, created_at
    FROM payslips WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
}

/** Uploads one payslip and immediately attempts extraction (PDFs only —
 * see parsePayslipText). Validates type/size BEFORE anything touches
 * storage or the DB; extraction failures never block the upload itself
 * (the file is always saved even if reading it fails). */
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

  await extractPayslipFields(row.id, bytes, file.type);
  return ok({ id: row.id });
}

/** Called right after upload, and re-callable to retry a failed
 * extraction. Never throws outward on a parsing failure — degrades to
 * 'extraction_failed' (or 'unsupported_format' for a non-PDF, since plain
 * code can't read text out of a photo) so the UI falls back to manual
 * entry, same pattern contracts.ts already uses for its permanently-
 * unavailable state. */
export async function extractPayslipFields(id: number, bytes?: ArrayBuffer, contentType?: string): Promise<void> {
  // Ownership-checked even though this is almost always called right
  // after uploadPayslip's own check — it's also reachable directly as a
  // public RPC (every export from a "use server" file is), and an id
  // alone must never be enough to read or re-extract another user's file.
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [owned] = await db().sql<{ id: number }>`SELECT id FROM payslips WHERE id = ${id} AND user_id = ${userId}`;
  if (!owned) return;

  let data = bytes;
  let mediaType = contentType;
  if (!data || !mediaType) {
    const [row] = await db().sql<{ blob_key: string; content_type: string }>`
      SELECT blob_key, content_type FROM payslips WHERE id = ${id} AND user_id = ${userId}
    `;
    if (!row) return;
    const stored = await payslipsStore().get(row.blob_key, { type: "arrayBuffer" });
    if (!stored) {
      await db().sql`UPDATE payslips SET extraction_status = 'extraction_failed' WHERE id = ${id} AND user_id = ${userId}`;
      return;
    }
    data = stored;
    mediaType = row.content_type;
  }

  if (mediaType !== "application/pdf") {
    await db().sql`UPDATE payslips SET extraction_status = 'unsupported_format' WHERE id = ${id} AND user_id = ${userId}`;
    return;
  }

  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(data) });
    const { text } = await parser.getText();
    const fields = parsePayslipText(text);

    const foundAnything = Object.entries(fields).some(([key, value]) => key !== "notes" && value !== null);
    if (!foundAnything) {
      await db().sql`UPDATE payslips SET extraction_status = 'extraction_failed' WHERE id = ${id} AND user_id = ${userId}`;
      return;
    }

    await db().sql`
      UPDATE payslips SET extraction_status = 'extracted', extracted_fields = ${JSON.stringify(fields)}::jsonb
      WHERE id = ${id} AND user_id = ${userId}
    `;
  } catch {
    // Never surfaces the raw error to the user, never invents a fallback
    // number — just marks the attempt failed so the UI offers manual entry.
    await db().sql`UPDATE payslips SET extraction_status = 'extraction_failed' WHERE id = ${id} AND user_id = ${userId}`;
  } finally {
    if (parser) await parser.destroy();
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
