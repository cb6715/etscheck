"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { normalizePlate, formatPlate } from "@/lib/plate";
import { startOfDay } from "@/lib/date";

export async function lookupPlate(rawPlate: string) {
  const plate = normalizePlate(rawPlate);
  if (plate.length < 2) return null;
  const customer = await prisma.driveInCustomer.findUnique({
    where: { licensePlate: plate },
    include: {
      company: true,
      visits: { orderBy: { visitedAt: "desc" }, take: 5 },
    },
  });
  return customer;
}

export type CreateVisitInput = {
  licensePlate: string;
  companyName?: string;
  refNumber?: string;
  visitType?: string;
  service?: string;
  note?: string;
};

export async function createDriveInVisit(input: CreateVisitInput) {
  const userId = await getCurrentUserId();
  const plateRaw = input.licensePlate.trim();
  if (!plateRaw) throw new Error("Nummerplade mangler");
  const plate = normalizePlate(plateRaw);

  let companyId: string | null = null;
  if (input.companyName?.trim()) {
    const company = await prisma.company.upsert({
      where: { name: input.companyName.trim() },
      update: {},
      create: { name: input.companyName.trim() },
    });
    companyId = company.id;
  }

  const customer = await prisma.driveInCustomer.upsert({
    where: { licensePlate: plate },
    update: { companyId: companyId ?? undefined },
    create: {
      licensePlate: plate,
      licensePlateDisplay: formatPlate(plate),
      companyId,
    },
  });

  const visit = await prisma.driveInVisit.create({
    data: {
      customerId: customer.id,
      companyId,
      userId,
      refNumber: input.refNumber?.trim() || null,
      visitType: input.visitType?.trim() || null,
      service: input.service?.trim() || null,
      note: input.note?.trim() || null,
    },
  });

  revalidatePath("/drive-in");
  revalidatePath("/");
  return visit;
}

export async function getTodayVisits() {
  const day = startOfDay(new Date());
  const tomorrow = new Date(day);
  tomorrow.setDate(day.getDate() + 1);

  return prisma.driveInVisit.findMany({
    where: { visitedAt: { gte: day, lt: tomorrow } },
    include: { customer: true, company: true },
    orderBy: { visitedAt: "desc" },
  });
}

export async function getCompanyDetail(companyId: string) {
  return prisma.company.findUnique({
    where: { id: companyId },
    include: {
      visits: { orderBy: { visitedAt: "desc" }, include: { customer: true } },
    },
  });
}

export async function getAllCompanies() {
  const companies = await prisma.company.findMany({
    include: { _count: { select: { visits: true } } },
    orderBy: { name: "asc" },
  });
  return companies;
}
