import { Suspense } from "react";
import { getTodayVisits } from "@/lib/actions/drivein";
import { DriveInPageClient } from "./drivein-page-client";

export const dynamic = "force-dynamic";

export default async function DriveInPage() {
  const visits = await getTodayVisits();
  return (
    <Suspense>
      <DriveInPageClient visits={visits} />
    </Suspense>
  );
}
