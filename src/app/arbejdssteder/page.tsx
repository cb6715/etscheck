import { MapPin } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getWorkplaces } from "@/lib/workplace-actions";
import { ArbejdsstederClient } from "./arbejdssteder-client";

export const dynamic = "force-dynamic";

export default async function ArbejdsstederPage() {
  await requirePageAccess();
  const workplaces = await getWorkplaces();
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <MapPin size={22} /> Arbejdssteder
      </h1>
      <ArbejdsstederClient initialWorkplaces={workplaces} />
    </div>
  );
}
