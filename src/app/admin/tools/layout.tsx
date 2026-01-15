import Link from "next/link";
import SignOutButton from "../../components/SignOutButton";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh app-background-theme">
      <div className="mx-auto w-full max-w-[480px] px-5">
        <header className="sticky top-0 z-20 border-b bg-surface border-border">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="text-xs text-secondary hover:text-foreground">
                Back to admin
              </Link>
              <span className="text-xs text-secondary">·</span>
              <span className="text-sm font-semibold text-foreground">Admin tools</span>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="py-6">{children}</main>
      </div>
    </div>
  );
}
