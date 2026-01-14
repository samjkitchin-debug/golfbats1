import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SignOutButton from "@/app/components/SignOutButton";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export default async function MeEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  // Require authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface border-b border-border">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex w-16 justify-start">
            <Link href="/" className="text-sm font-semibold text-foreground">
              DayForeIt
            </Link>
          </div>

          <Link href="/" className="flex flex-1 justify-center">
            <Image
              src="/logo.png"
              alt="DayForeIt"
              width={120}
              height={60}
              className="h-auto w-auto max-h-[60px] object-contain"
              style={{ width: "auto" }}
              priority
            />
          </Link>

          <div className="flex w-16 justify-end">
            <SignOutButton />
          </div>
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-action-blue" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>
    </div>
  );
}
