import "server-only";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { getAccessState, type AccessState } from "@/lib/access";

// Shared page-level gate: not logged in → /login, logged in but no active
// subscription/owner access → /abonnement. Used at the top of every
// protected Server Component page — defense-in-depth alongside the
// per-action requireActiveAccess checks in actions.ts, which protect the
// data operations themselves even if a page-level check were ever bypassed.
export async function requirePageAccess(): Promise<{ userId: number; access: AccessState }> {
  const userId = await getSessionUserId();
  if (userId === null) redirect("/login");
  const access = await getAccessState(userId);
  if (!access.hasAccess) redirect("/abonnement");
  return { userId, access };
}
