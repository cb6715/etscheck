"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { NoteTargetType } from "@prisma/client";
import { normalizePlate } from "@/lib/plate";

export async function getCategories() {
  const userId = await getCurrentUserId();
  return prisma.category.findMany({
    where: { userId, deletedAt: null },
    orderBy: { order: "asc" },
  });
}

export async function createCategory(name: string, icon: string, color: string) {
  const userId = await getCurrentUserId();
  const count = await prisma.category.count({ where: { userId, deletedAt: null } });
  const category = await prisma.category.create({
    data: { userId, name: name.trim(), icon, color, order: count },
  });
  revalidatePath("/indstillinger");
  return category;
}

export async function deleteCategory(id: string) {
  const userId = await getCurrentUserId();
  await prisma.category.updateMany({
    where: { id, userId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/indstillinger");
}

export type CreateNoteInput = {
  text: string;
  targetType: NoteTargetType;
  taskId?: string;
  trailerId?: string;
  customerId?: string;
  isProblem?: boolean;
};

export async function createNote(input: CreateNoteInput) {
  const userId = await getCurrentUserId();
  if (!input.text.trim()) throw new Error("Note mangler tekst");
  const note = await prisma.note.create({
    data: {
      userId,
      text: input.text.trim(),
      targetType: input.targetType,
      taskId: input.taskId,
      trailerId: input.trailerId,
      customerId: input.customerId,
      isProblem: !!input.isProblem,
    },
  });
  revalidatePath("/");
  revalidatePath("/noter");
  return note;
}

export async function getNotes() {
  const userId = await getCurrentUserId();
  return prisma.note.findMany({
    where: { userId },
    include: { task: true, trailer: true, customer: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOpenProblems() {
  const userId = await getCurrentUserId();
  return prisma.note.findMany({
    where: { userId, isProblem: true, resolved: false },
    include: { trailer: true, task: true, customer: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function globalSearch(query: string) {
  const q = query.trim();
  if (!q) return { tasks: [], trailers: [], customers: [], companies: [] };

  const plateNormalized = normalizePlate(q);

  const [tasks, trailers, customers, companies] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, title: { contains: q, mode: "insensitive" } },
      take: 10,
      orderBy: { scheduledFor: "desc" },
    }),
    prisma.trailer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { licensePlate: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
    }),
    prisma.driveInCustomer.findMany({
      where: {
        OR: [
          { licensePlate: { contains: plateNormalized, mode: "insensitive" } },
          { licensePlateDisplay: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { company: true, visits: { orderBy: { visitedAt: "desc" }, take: 3 } },
      take: 10,
    }),
    prisma.company.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      include: { _count: { select: { visits: true } } },
      take: 10,
    }),
  ]);

  return { tasks, trailers, customers, companies };
}
