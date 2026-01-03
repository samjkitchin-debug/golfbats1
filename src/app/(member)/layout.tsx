"use client";

import Link from "next/link";
import Image from "next/image";
import BottomNav from "../components/BottomNav";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header: brand only */}
      <header className="sticky top-0 z-20 bg-white">
        <div className="mx-auto w-full max-w-md px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="GolfBats logo"
              width={36}
              height={36}
              priority
              className="h-9 w-9"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold text-brand-black">
                GolfBats
              </span>
              <span className="text-xs tracking-wide text-gray-500">
                club board
              </span>
            </div>
          </Link>
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
        {children}
      </main>

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
