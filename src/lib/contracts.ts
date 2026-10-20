"use server";

// Secure storage for uploaded ansættelseskontrakter. File BYTES live in a
// private Netlify Blobs store ("contracts") — never a public URL, never the
// Postgres database — and are only ever read back by server code after an
// ownership check. The `contracts` DB table (see the schedules/workplaces
// migration) holds metadata plus whatever structured fields exist.
//
// IMPORTANT, per this app's explicit no-faking rule: there is no AI/LLM API
// key configured anywhere in this app's environment (checked directly in
// Netlify's env vars and the local .env during this work). Automatic field
// extraction from the uploaded file is therefore NOT implemented — every
// upload is created with extraction_status = 'ai_unavailable' and the UI
// must route straight to the manual-entry form. If a key is ever configured
// (e.g. ANTHROPIC_API_KEY), real extraction can be added as a genuinely new
// step that flips this status to 'extracted' — never simulated.

import { randomUUID } from "crypto";
import { getStore } from "@netlify/blobs";
import { db } from "@/lib/db";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/actions";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function contractsStore() {
  return getStore("contracts");
}

export type ContractRow = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  extraction_status: string;
  extracted_fields: Record<string, unknown> | null;
  confirmed_fields: Record<string, unknown> | null;
  created_at: Date;
};

export async function getContracts(): Promise<ContractRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return db().sql<ContractRow>`
    SELECT id, filename, content_type, size_bytes, extraction_status, extracted_fields, confirmed_fields, created_at
    FROM contracts WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
}

/** Uploads one contract file. Validates type/size BEFORE anything touches
 * storage or the DB — a rejected file never gets a blob key or a row. */
export async function uploadContract(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const userId = await getUserId();
  await requireActiveAccess(userId);

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Ingen fil valgt.");
  if (file.size === 0) return fail("Filen er tom.");
  if (file.size > MAX_SIZE_BYTES) return fail("Filen er for stor (maks 10 MB).");
  if (!ALLOWED_TYPES.has(file.type)) return fail("Kun PDF, PNG eller JPG er tilladt.");

  // Sanitized filename component only — the real identity of the blob is
  // the random UUID prefix, so a hostile filename (path traversal, control
  // characters) can never influence the storage key.
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const blobKey = `${userId}/${randomUUID()}-${safeName}`;

  const bytes = await file.arrayBuffer();
  await contractsStore().set(blobKey, bytes, { metadata: { userId, contentType: file.type } });

  const [row] = await db().sql<{ id: number }>`
    INSERT INTO contracts (user_id, filename, content_type, size_bytes, blob_key, extraction_status)
    VALUES (${userId}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size}, ${blobKey}, 'ai_unavailable')
    RETURNING id
  `;
  return ok({ id: row.id });
}

/** Saves the fields the user typed in the manual-entry fallback form,
 * confirming what the contract says since automatic extraction isn't
 * available. Ownership-checked on user_id, same as every other mutation. */
export async function confirmContractFields(id: number, fields: Record<string, unknown>): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [existing] = await db().sql<{ id: number }>`SELECT id FROM contracts WHERE id = ${id} AND user_id = ${userId}`;
  if (!existing) return fail("Kontrakten findes ikke.");
  await db().sql`
    UPDATE contracts SET confirmed_fields = ${JSON.stringify(fields)}::jsonb WHERE id = ${id} AND user_id = ${userId}
  `;
  return ok(undefined);
}

export async function deleteContract(id: number): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [row] = await db().sql<{ blob_key: string }>`SELECT blob_key FROM contracts WHERE id = ${id} AND user_id = ${userId}`;
  if (!row) return fail("Kontrakten findes ikke.");
  await contractsStore().delete(row.blob_key);
  await db().sql`DELETE FROM contracts WHERE id = ${id} AND user_id = ${userId}`;
  return ok(undefined);
}
