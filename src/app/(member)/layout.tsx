"use client";

import Link from "next/link";
import Image from "next/image";
import BottomNav from "../components/BottomNav";
import SignOutButton from "../components/SignOutButton";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="GolfBats logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-md"
              priority
            />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-tight text-gray-900">
                GolfBats
              </span>
              <span className="text-xs tracking-wide text-gray-500">club board</span>
            </div>
          </Link>

          <SignOutButton />
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-md px-4 pb-24">
        <div className="mt-8 flex items-center justify-between border-t pt-4 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} GolfBats</span>
          <Link href="/admin" className="hover:text-brand-black">
            Admin
          </Link>
        </div>
      </footer>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
