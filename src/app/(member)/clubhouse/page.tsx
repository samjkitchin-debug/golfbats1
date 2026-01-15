"use client";

import Link from "next/link";

export default function ClubhousePage() {
  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Clubhouse</h1>
        <p className="mt-1 text-xs text-muted">Around the group</p>
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
