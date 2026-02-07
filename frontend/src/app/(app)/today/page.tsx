import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function TodayPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold text-text-primary">Today</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Signed in as {session.user?.email}
      </p>
      <p className="mt-4 text-xs text-text-muted">
        Phase 4 will build the full today view here.
      </p>
    </div>
  );
}
