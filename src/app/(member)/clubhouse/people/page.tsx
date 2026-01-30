"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { logClubhouseEvent } from "../../../lib/clubhouseEvents";

export default function ClubhousePeoplePage() {
  const roomEnteredRef = useRef(false);
  useEffect(() => {
    if (roomEnteredRef.current) return;
    roomEnteredRef.current = true;
    fetch("/api/me/bootstrap", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((b) => {
        const id = b?.activeGroupId ?? b?.approvedGroups?.[0]?.id ?? null;
        if (id) logClubhouseEvent({ event_type: "room_entered", group_id: id, room_id: "people" });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="pb-24 px-5 pt-4">
      <Link href="/clubhouse" className="text-xs text-muted hover:text-foreground underline">
        ← Clubhouse
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-foreground">People</h1>
      <p className="mt-1 text-xs text-muted">Everyone in this group</p>
      <p className="mt-4">
        <Link
          href="/members"
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface/90"
        >
          View members
        </Link>
      </p>
    </div>
  );
}
