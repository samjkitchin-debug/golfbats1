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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="Day fore it"
            width={160}
            height={80}
            className="h-auto w-auto max-h-[80px] object-contain"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-foreground">
          Welcome to Day fore it
        </h1>

        {/* Sign-in */}
        <LoginClient />
      </div>
    </div>
  );
}
