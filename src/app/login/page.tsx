import Image from "next/image";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { createSupabaseServerClient } from "../lib/supabaseServer";

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
      <div className="w-full max-w-md rounded-2xl bg-white p-8">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo.png"
            alt="GolfBats logo"
            width={80}
            height={80}
            className="rounded-xl"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-black">
          Welcome to GolfBats
        </h1>

        {/* Sign-in */}
        <div className="flex flex-col items-center">
          <div className="w-full">
            <LoginClient />
          </div>
        </div>
      </div>
    </div>
  );
}
