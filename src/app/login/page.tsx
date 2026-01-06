import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export const metadata: Metadata = {
  title: "GolfBats - Login",
};

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in → go home
  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="GolfBats logo"
            width={96}
            height={96}
            priority
          />
        </div>

        {/* Title */}
        <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-black">
          Welcome to GolfBats
        </h1>

        {/* Sign-in */}
        <LoginClient />
      </div>
    </div>
  );
}
