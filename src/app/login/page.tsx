import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    // Invalid or expired refresh token: treat as unauthenticated and show login form
    user = null;
  }

  if (user) redirect("/");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/brand/logo-app.png"
            alt="DayForeIt"
            width={128}
            height={64}
            className="h-auto w-auto max-h-[55px] object-contain"
            style={{ width: "auto" }}
            priority
          />
        </div>

        <p className="mb-10 text-center text-sm text-muted">
          Your group's home for golf days.
        </p>

        <Suspense fallback={null}>
          <LoginClient />
        </Suspense>
      </div>
    </div>
  );
}
