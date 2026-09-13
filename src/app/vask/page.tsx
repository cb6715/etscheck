import { Suspense } from "react";
import { getTrailers } from "@/lib/actions/trailers";
import { VaskPageClient } from "./vask-page-client";

export const dynamic = "force-dynamic";

export default async function VaskPage() {
  const trailers = await getTrailers();
  return (
    <Suspense>
      <VaskPageClient trailers={trailers} />
    </Suspense>
  );
}
