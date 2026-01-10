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
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex w-16 justify-start">
            <Link href="/" className="text-sm font-semibold text-gray-900">
              GolfBats
            </Link>
          </div>

          <Link href="/" className="flex flex-1 justify-center">
            <Image
              src="/logo.png"
              alt="GolfBats logo"
              width={86}
              height={86}
              className="h-[86px] w-[86px] rounded-md"
              priority
            />
          </Link>

          <div className="flex w-16 justify-end">
            <SignOutButton />
          </div>
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>
    </div>
  );
}
