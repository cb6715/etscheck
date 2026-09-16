"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TrailerStatus } from "@prisma/client";
import { WASH_COMPANIES, type WashCompany } from "@/lib/wash-constants";
import { normalizePlate } from "@/lib/plate";
import { copenhagenStartOfDay } from "@/lib/timezone";
import { recordVaskeCompleted } from "@/lib/actions/briefing";

// Vaskeplan is a view of TODAY's work, not a permanent trailer roster — a
// trailer that isn't touched again (washed, edited, revived) after the day
// it arrived shouldn't keep reappearing under "Mangler" on later days. Shows
// only trailers touched today (createdAt/updatedAt covers created, edited,
// status-changed and washed — all bump updatedAt) plus anything with a
// still-open problem, which stays visible regardless of day. Older trailers
// aren't deleted — they simply drop out of this view; their wash history
// is still reachable via the calendar.
export async function getTrailers() {
  const today = copenhagenStartOfDay(new Date());
  return prisma.trailer.findMany({
    where: {
      deletedAt: null,
      OR: [{ updatedAt: { gte: today } }, { notes: { some: { isProblem: true, resolved: false } } }],
    },
    include: {
      washes: { orderBy: { washedAt: "desc" }, take: 1 },
      notes: { where: { isProblem: true, resolved: false } },
    },
    orderBy: { number: "asc" },
  });
}

export async function getTrailerDetail(id: string) {
  return prisma.trailer.findUnique({
    where: { id },
    include: {
      washes: { orderBy: { washedAt: "desc" }, include: { user: true } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
}

// All trailer washes recorded on a given calendar day, for the kalender
// history view — trailers themselves drop out of the live Vaskeplan after
// their day, but what got washed and when stays visible here.
export async function getTrailerWashesForDay(day: Date) {
  const start = copenhagenStartOfDay(day);
  const end = copenhagenStartOfDay(new Date(start.getTime() + 25 * 60 * 60 * 1000));
  return prisma.trailerWash.findMany({
    where: { washedAt: { gte: start, lt: end } },
    include: { trailer: true },
    orderBy: { washedAt: "asc" },
  });
}

export type CreateTrailerInput = {
  number: string;
  licensePlate?: string;
  type?: string;
  note?: string;
  status?: TrailerStatus;
  company?: WashCompany | "";
};

export async function createTrailer(input: CreateTrailerInput) {
  const number = input.number.trim() || input.licensePlate?.trim();
  if (!number) throw new Error("Angiv enten trailernummer eller nummerplade.");

  const data = {
    licensePlate: input.licensePlate?.trim() || null,
    type: input.type?.trim() || null,
    note: input.note?.trim() || null,
    status: input.status || TrailerStatus.MANGLER,
    company: input.company || null,
  };

  // Same physical trailer (e.g. a recurring DSV/DFDS number) coming back on
  // a later day — "number" is unique, and it's still sitting in the DB from
  // its last visit (just no longer shown, since that day has passed).
  // Revive it into today's Vaskeplan instead of failing on the unique
  // constraint: touching it bumps updatedAt, which is what makes it
  // reappear in getTrailers().
  const existing = await prisma.trailer.findFirst({ where: { number, deletedAt: null } });
  const trailer = existing
    ? await prisma.trailer.update({ where: { id: existing.id }, data })
    : await prisma.trailer.create({ data: { number, ...data } });

  revalidatePath("/vask");
  revalidatePath("/");
  return trailer;
}

export type MarkWashedInput = {
  company: WashCompany;
  plombeNumber?: string;
  note?: string;
};

export async function markTrailerWashed(trailerId: string, input: MarkWashedInput) {
  const userId = await getCurrentUserId();
  if (!WASH_COMPANIES.includes(input.company)) throw new Error("Ugyldigt firma");

  await prisma.trailer.update({
    where: { id: trailerId },
    data: { status: TrailerStatus.VASKET },
  });
  await prisma.trailerWash.create({
    data: {
      trailerId,
      userId,
      note: input.note?.trim() || null,
      company: input.company,
      // Only DFDS trailers carry a seal/plombe number.
      plombeNumber: input.company === "DFDS" ? input.plombeNumber?.trim() || null : null,
    },
  });
  await recordVaskeCompleted(userId);

  revalidatePath("/vask");
  revalidatePath(`/vask/${trailerId}`);
  revalidatePath("/");
}

export async function updateTrailerStatus(trailerId: string, status: TrailerStatus, note?: string) {
  const userId = await getCurrentUserId();
  await prisma.trailer.update({
    where: { id: trailerId },
    data: { status },
  });

  if (status === TrailerStatus.VASKET) {
    await prisma.trailerWash.create({
      data: { trailerId, userId, note: note?.trim() || null },
    });
    await recordVaskeCompleted(userId);
  }

  if (status === TrailerStatus.PROBLEM && note?.trim()) {
    await prisma.note.create({
      data: {
        userId,
        trailerId,
        text: note.trim(),
        targetType: "TRAILER",
        isProblem: true,
      },
    });
  }

  revalidatePath("/vask");
  revalidatePath(`/vask/${trailerId}`);
  revalidatePath("/");
}

export async function updateTrailer(trailerId: string, input: Partial<CreateTrailerInput>) {
  await prisma.trailer.update({
    where: { id: trailerId },
    data: {
      licensePlate: input.licensePlate?.trim() || undefined,
      type: input.type?.trim() || undefined,
      note: input.note?.trim(),
      company: input.company !== undefined ? input.company || null : undefined,
    },
  });
  revalidatePath("/vask");
  revalidatePath(`/vask/${trailerId}`);
}

export async function deleteTrailer(trailerId: string) {
  await prisma.trailer.update({
    where: { id: trailerId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/vask");
}

export async function addTrailerNote(trailerId: string, text: string) {
  const userId = await getCurrentUserId();
  if (!text.trim()) return;
  await prisma.note.create({
    data: { userId, trailerId, text: text.trim(), targetType: "TRAILER" },
  });
  revalidatePath(`/vask/${trailerId}`);
}

export async function lookupTrailerByPlate(rawPlate: string) {
  const plate = normalizePlate(rawPlate);
  if (plate.length < 3) return null;

  const candidates = await prisma.trailer.findMany({
    where: { licensePlate: { not: null }, deletedAt: null },
    select: { number: true, company: true, type: true, licensePlate: true },
  });
  return candidates.find((t) => t.licensePlate && normalizePlate(t.licensePlate) === plate) ?? null;
}

export async function resolveProblem(noteId: string) {
  await prisma.note.update({
    where: { id: noteId },
    data: { resolved: true, resolvedAt: new Date() },
  });
  revalidatePath("/vask");
  revalidatePath("/");
}
