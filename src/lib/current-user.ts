import { prisma } from "@/lib/prisma";

const DEFAULT_EMAIL = "cornelius@neurix.dk";
const DEFAULT_NAME = "Cornelius";

let cachedUserId: string | null = null;

export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const user = await prisma.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: {},
    create: { email: DEFAULT_EMAIL, name: DEFAULT_NAME, role: "MEDARBEJDER" },
  });

  cachedUserId = user.id;
  return user.id;
}
