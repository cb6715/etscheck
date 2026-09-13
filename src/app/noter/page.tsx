import { Suspense } from "react";
import { getNotes } from "@/lib/actions/misc";
import { NoterPageClient } from "./noter-page-client";

export const dynamic = "force-dynamic";

export default async function NoterPage() {
  const notes = await getNotes();
  return (
    <Suspense>
      <NoterPageClient notes={notes} />
    </Suspense>
  );
}
