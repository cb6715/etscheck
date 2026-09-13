import { Suspense } from "react";
import { ensureTodayTasksGenerated, getTasksForDay } from "@/lib/actions/tasks";
import { getCategories } from "@/lib/actions/misc";
import { TasksPageClient } from "./tasks-page-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const now = new Date();
  await ensureTodayTasksGenerated(now);
  const [tasks, categories] = await Promise.all([getTasksForDay(now), getCategories()]);

  return (
    <Suspense>
      <TasksPageClient tasks={tasks} categories={categories} />
    </Suspense>
  );
}
