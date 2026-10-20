"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/actions";

// Arbejdssteder brugeren kan tjekke ind på — se src/lib/geolocation.ts for
// den ærlige forgrunds-afstandstjek-logik, der bruger disse rækker. Alt her
// er ejerskabs-tjekket på user_id i hver WHERE, så en bruger aldrig kan
// læse/ændre/slette en andens arbejdssted via et gættet id.

export type WorkplaceRow = {
  id: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_meters: number;
  enabled: boolean;
};

export async function getWorkplaces(): Promise<WorkplaceRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return db().sql<WorkplaceRow>`
    SELECT id, name, address, lat, lng, radius_meters, enabled
    FROM workplaces WHERE user_id = ${userId} ORDER BY created_at ASC
  `;
}

export type CreateWorkplaceInput = {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
};

// No requireActiveAccess here, unlike every other action in this file —
// this is also called from the onboarding wizard, right after signUp(),
// before a brand-new (non-owner) account has any subscription at all. A
// gate that always throws for the exact moment it's meant to run isn't a
// gate, it's a guaranteed failure; account SETUP (this, uploadContract)
// stays free, while actually USING any of it still requires reaching a
// page behind requirePageAccess, which is where the real paywall lives.
export async function createWorkplace(input: CreateWorkplaceInput): Promise<ActionResult<{ id: number }>> {
  const userId = await getUserId();
  const name = input.name.trim();
  if (!name) return fail("Arbejdsstedet skal have et navn.");
  if (input.lat !== undefined && (input.lat < -90 || input.lat > 90)) return fail("Ugyldig breddegrad.");
  if (input.lng !== undefined && (input.lng < -180 || input.lng > 180)) return fail("Ugyldig længdegrad.");

  const [row] = await db().sql<{ id: number }>`
    INSERT INTO workplaces (user_id, name, address, lat, lng, radius_meters)
    VALUES (
      ${userId}, ${name}, ${input.address ?? null}, ${input.lat ?? null}, ${input.lng ?? null},
      ${input.radiusMeters ?? 150}
    ) RETURNING id
  `;
  revalidatePath("/arbejdssteder");
  return ok({ id: row.id });
}

export async function updateWorkplace(id: number, input: Partial<CreateWorkplaceInput & { enabled: boolean }>): Promise<ActionResult> {
  const userId = await getUserId();
  const client = db();
  await requireActiveAccess(userId, client);

  const [existing] = await client.sql<{ id: number }>`SELECT id FROM workplaces WHERE id = ${id} AND user_id = ${userId}`;
  if (!existing) return fail("Arbejdsstedet findes ikke.");

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail("Arbejdsstedet skal have et navn.");
    await client.sql`UPDATE workplaces SET name = ${name} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (input.address !== undefined) {
    await client.sql`UPDATE workplaces SET address = ${input.address} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (input.lat !== undefined && input.lng !== undefined) {
    await client.sql`UPDATE workplaces SET lat = ${input.lat}, lng = ${input.lng} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (input.radiusMeters !== undefined) {
    await client.sql`UPDATE workplaces SET radius_meters = ${input.radiusMeters} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (input.enabled !== undefined) {
    await client.sql`UPDATE workplaces SET enabled = ${input.enabled} WHERE id = ${id} AND user_id = ${userId}`;
  }
  revalidatePath("/arbejdssteder");
  return ok(undefined);
}

export async function deleteWorkplace(id: number): Promise<ActionResult> {
  const userId = await getUserId();
  const client = db();
  await requireActiveAccess(userId, client);
  await client.sql`DELETE FROM workplaces WHERE id = ${id} AND user_id = ${userId}`;
  revalidatePath("/arbejdssteder");
  return ok(undefined);
}
