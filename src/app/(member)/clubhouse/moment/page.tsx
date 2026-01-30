"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { logClubhouseEvent } from "../../../lib/clubhouseEvents";

export default function ClubhouseMomentPage() {
  const roomEnteredRef = useRef(false);
  useEffect(() => {
    if (roomEnteredRef.current) return;
    roomEnteredRef.current = true;
    fetch("/api/me/bootstrap", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((b) => {
        const id = b?.activeGroupId ?? b?.approvedGroups?.[0]?.id ?? null;
        if (id) logClubhouseEvent({ event_type: "room_entered", group_id: id, room_id: "moment" });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="pb-24 px-5 pt-4">
      <Link href="/clubhouse" className="text-xs text-muted hover:text-foreground underline">
        ← Clubhouse
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Moment</h1>
      <p className="mt-1 text-xs text-muted">Next round and today</p>
      <p className="mt-4 text-sm text-muted">
        This room will wake up once scoring and trip data exist. You’ll see what’s next and what’s happening today.
      </p>
    </div>
  );
}
