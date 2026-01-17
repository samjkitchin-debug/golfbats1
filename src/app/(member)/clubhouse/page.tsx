"use client";

import Link from "next/link";

export default function ClubhousePage() {
  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Clubhouse</h1>
        <p className="mt-1 text-xs text-muted">Around the group</p>
      </div>

      {/* Group actions */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/join-group"
          className="rounded-lg bg-transparent border border-ink-300 text-ink-700 px-4 py-2 text-sm font-medium hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/20 active:scale-[0.98] transition-transform"
        >
          Join group
        </Link>
        <Link
          href="/create-group"
          className="rounded-lg btn-anticipation px-4 py-2 text-sm font-medium active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
        >
          Create group
        </Link>
      </div>

      <div className="space-y-8">
        {/* Recent rounds section */}
        <section>
          <h2 className="text-sm font-medium text-foreground mb-2">Recent rounds</h2>
          <p className="text-xs text-muted">
            Rounds you've played together will show up here.
          </p>
        </section>

        {/* People section */}
        <section>
          <Link
            href="/members"
            className="block"
          >
            <h2 className="text-sm font-medium text-foreground mb-1">People</h2>
            <p className="text-xs text-muted">
              Everyone in this group
            </p>
          </Link>
        </section>
      </div>
    </div>
  );
}
