"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { TrailerStatus } from "@prisma/client";
import { WASH_COMPANIES, type WashCompany } from "@/lib/wash-constants";

export async function getTrailers() {
  return prisma.trailer.findMany({
    where: { deletedAt: null },
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

export type CreateTrailerInput = {
  number: string;
  licensePlate?: string;
  type?: string;
  note?: string;
  status?: TrailerStatus;
  company?: WashCompany | "";
};

export async function createTrailer(input: CreateTrailerInput) {
  if (!input.number.trim()) throw new Error("Trailernummer mangler");
  const trailer = await prisma.trailer.create({
    data: {
      number: input.number.trim(),
      licensePlate: input.licensePlate?.trim() || null,
      type: input.type?.trim() || null,
      note: input.note?.trim() || null,
      status: input.status || TrailerStatus.MANGLER,
      company: input.company || null,
    },
  });
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

export async function resolveProblem(noteId: string) {
  await prisma.note.update({
    where: { id: noteId },
    data: { resolved: true, resolvedAt: new Date() },
  });
  revalidatePath("/vask");
  revalidatePath("/");
}
