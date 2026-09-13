import { PrismaClient, Priority, RecurrenceType, TrailerStatus, NoteTargetType } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePlate(plate: string) {
  return plate.replace(/\s+/g, "").toUpperCase();
}

function formatPlate(plate: string) {
  const n = normalizePlate(plate);
  const letters = n.match(/^[A-Z]+/)?.[0] ?? "";
  const digits = n.slice(letters.length);
  if (digits.length >= 5) {
    return `${letters} ${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return `${letters} ${digits}`;
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "cornelius@neurix.dk" },
    update: {},
    create: { email: "cornelius@neurix.dk", name: "Cornelius", role: "MEDARBEJDER" },
  });

  const categoriesData = [
    { name: "Rengøring", icon: "🧹", color: "#22c55e", order: 0 },
    { name: "Trailere", icon: "🚛", color: "#3b82f6", order: 1 },
    { name: "Drive-in", icon: "🚗", color: "#f59e0b", order: 2 },
    { name: "Vedligeholdelse", icon: "🔧", color: "#a855f7", order: 3 },
    { name: "Andet", icon: "📦", color: "#64748b", order: 4 },
  ];

  const categories: Record<string, string> = {};
  for (const c of categoriesData) {
    const cat = await prisma.category.upsert({
      where: { id: `seed-cat-${c.name}` },
      update: {},
      create: { id: `seed-cat-${c.name}`, userId: user.id, ...c },
    });
    categories[c.name] = cat.id;
  }

  // Recurring templates
  const fridayTemplate = await prisma.taskTemplate.upsert({
    where: { id: "seed-template-fredag" },
    update: {},
    create: {
      id: "seed-template-fredag",
      userId: user.id,
      title: "Tøm skraldespande",
      description: "Tøm alle skraldespande på pladsen",
      priority: Priority.NORMAL,
      recurrenceType: RecurrenceType.UGEDAGE,
      weekdays: [5], // friday
      categoryId: categories["Rengøring"],
      checklistItems: {
        create: [
          { title: "Tøm skraldespande ved indkørsel", order: 0 },
          { title: "Tøm skraldespande ved vaskeplads", order: 1 },
        ],
      },
    },
  });

  await prisma.taskTemplate.upsert({
    where: { id: "seed-template-fej" },
    update: {},
    create: {
      id: "seed-template-fej",
      userId: user.id,
      title: "Fej pladsen",
      priority: Priority.NORMAL,
      recurrenceType: RecurrenceType.UGEDAGE,
      weekdays: [5],
      categoryId: categories["Rengøring"],
    },
  });

  await prisma.taskTemplate.upsert({
    where: { id: "seed-template-kontrol" },
    update: {},
    create: {
      id: "seed-template-kontrol",
      userId: user.id,
      title: "Kontroller vaskeplads",
      priority: Priority.VIGTIG,
      recurrenceType: RecurrenceType.UGEDAGE,
      weekdays: [2, 4], // tue, thu
      categoryId: categories["Vedligeholdelse"],
      checklistItems: {
        create: [
          { title: "Fjern affald", order: 0 },
          { title: "Fej gulv", order: 1 },
          { title: "Ryd slanger", order: 2 },
          { title: "Kontroller højtryksrenser", order: 3 },
          { title: "Fyld sæbe", order: 4 },
          { title: "Tjek afløb", order: 5 },
        ],
      },
    },
  });

  await prisma.taskTemplate.upsert({
    where: { id: "seed-template-forbrug" },
    update: {},
    create: {
      id: "seed-template-forbrug",
      userId: user.id,
      title: "Fyld forbrugsvarer",
      priority: Priority.NORMAL,
      recurrenceType: RecurrenceType.UGEDAGE,
      weekdays: [2, 4],
      categoryId: categories["Vedligeholdelse"],
    },
  });

  // Today's tasks (generated "instances")
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTasksData = [
    { title: "Tøm skraldespande", categoryId: categories["Rengøring"], priority: Priority.NORMAL, templateId: fridayTemplate.id, completed: true },
    { title: "Fej pladsen", categoryId: categories["Rengøring"], priority: Priority.NORMAL, completed: true },
    { title: "Ryd området", categoryId: categories["Rengøring"], priority: Priority.NORMAL, completed: true },
    { title: "Vask trailere fra haven", categoryId: categories["Trailere"], priority: Priority.VIGTIG, completed: false },
    { title: "Kontroller vaskeområdet", categoryId: categories["Vedligeholdelse"], priority: Priority.HASTER, completed: false },
  ];

  for (let i = 0; i < todayTasksData.length; i++) {
    const t = todayTasksData[i];
    await prisma.task.upsert({
      where: { id: `seed-task-today-${i}` },
      update: {},
      create: {
        id: `seed-task-today-${i}`,
        userId: user.id,
        title: t.title,
        categoryId: t.categoryId,
        priority: t.priority,
        templateId: t.templateId,
        order: i,
        scheduledFor: today,
        completed: t.completed,
        completedAt: t.completed ? new Date() : null,
      },
    });
  }

  // Trailers
  const trailersData = [
    { number: "102", status: TrailerStatus.MANGLER },
    { number: "108", status: TrailerStatus.VASKET },
    { number: "114", status: TrailerStatus.MANGLER },
    { number: "121", status: TrailerStatus.VASKET },
    { number: "130", status: TrailerStatus.I_GANG },
  ];

  for (const t of trailersData) {
    const trailer = await prisma.trailer.upsert({
      where: { number: t.number },
      update: { status: t.status },
      create: { number: t.number, status: t.status },
    });
    if (t.status === TrailerStatus.VASKET) {
      await prisma.trailerWash.upsert({
        where: { id: `seed-wash-${t.number}` },
        update: {},
        create: { id: `seed-wash-${t.number}`, trailerId: trailer.id, userId: user.id },
      });
    }
  }

  // Problem note on trailer 114
  const trailer114 = await prisma.trailer.findUnique({ where: { number: "114" } });
  if (trailer114) {
    await prisma.note.upsert({
      where: { id: "seed-note-problem-114" },
      update: {},
      create: {
        id: "seed-note-problem-114",
        userId: user.id,
        trailerId: trailer114.id,
        text: "Slange utæt.",
        targetType: NoteTargetType.TRAILER,
        isProblem: true,
      },
    });
  }

  // Companies + drive-in customers
  const abcTransport = await prisma.company.upsert({
    where: { name: "ABC Transport" },
    update: {},
    create: { name: "ABC Transport" },
  });
  const xyzLogistics = await prisma.company.upsert({
    where: { name: "XYZ Logistics" },
    update: {},
    create: { name: "XYZ Logistics" },
  });

  const plate1 = "AB12345";
  const customer1 = await prisma.driveInCustomer.upsert({
    where: { licensePlate: plate1 },
    update: {},
    create: {
      licensePlate: plate1,
      licensePlateDisplay: formatPlate(plate1),
      companyId: abcTransport.id,
    },
  });

  const plate2 = "CD45678";
  const customer2 = await prisma.driveInCustomer.upsert({
    where: { licensePlate: plate2 },
    update: {},
    create: {
      licensePlate: plate2,
      licensePlateDisplay: formatPlate(plate2),
      companyId: xyzLogistics.id,
    },
  });

  await prisma.driveInVisit.upsert({
    where: { id: "seed-visit-1" },
    update: {},
    create: {
      id: "seed-visit-1",
      customerId: customer1.id,
      companyId: abcTransport.id,
      userId: user.id,
      refNumber: "458921",
      service: "Trailer vask",
      visitedAt: new Date(new Date().setHours(8, 43, 0, 0)),
    },
  });

  await prisma.driveInVisit.upsert({
    where: { id: "seed-visit-2" },
    update: {},
    create: {
      id: "seed-visit-2",
      customerId: customer1.id,
      companyId: abcTransport.id,
      userId: user.id,
      refNumber: "457210",
      service: "Trailer vask",
      visitedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.driveInVisit.upsert({
    where: { id: "seed-visit-3" },
    update: {},
    create: {
      id: "seed-visit-3",
      customerId: customer2.id,
      companyId: xyzLogistics.id,
      userId: user.id,
      service: "Trailer vask",
      visitedAt: new Date(new Date().setHours(10, 17, 0, 0)),
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
