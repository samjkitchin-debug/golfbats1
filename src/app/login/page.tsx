import Image from "next/image";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If already signed in, go home
  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Logo + heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="GolfBats logo"
            width={72}
            height={72}
            className="mb-3 rounded-xl"
            priority
          />

          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Welcome to GolfBats
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            GolfBats is a private club board for organising golf trips —
            view upcoming outings, RSVP, check logistics, and see published
            results.
          </p>

          <p className="mt-3 text-sm text-gray-600">
            Please sign in to continue.
          </p>
        </div>

        {/* Auth actions */}
        <LoginClient />

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Access is limited to approved members.
        </p>
      </div>
    </div>
  );
}
