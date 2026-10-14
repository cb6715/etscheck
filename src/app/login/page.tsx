import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { getSessionUserId } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if ((await getSessionUserId()) !== null) redirect("/");
  return (
    <div className="animate-fade-up space-y-5 pt-6">
      <h1 className="flex items-center justify-center gap-2 text-xl font-extrabold tracking-tight">
        <LogIn size={22} /> Log ind
      </h1>
      <LoginForm />
    </div>
  );
}
