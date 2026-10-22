import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionCookie = process.env.CP_SESSION_COOKIE_NAME ?? "cp_session";
  if (!cookieStore.get(sessionCookie)?.value) redirect("/sign-in?next=/onboarding");
  return <div className="min-h-dvh">{children}</div>;
}
