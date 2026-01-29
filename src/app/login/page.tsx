import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginClient from "./LoginClient";
import LoginDebugStrip from "./LoginDebugStrip";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  const isDev = process.env.NODE_ENV === "development";

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

        {isDev && (
          <Suspense fallback={null}>
            <LoginDebugStrip />
          </Suspense>
        )}
      </div>
    </div>
  );
}
