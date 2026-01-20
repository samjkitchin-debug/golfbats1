"use client";

import { useRouter } from "next/navigation";
import type { InstrumentRenderProps } from "./instrumentTypes";

/**
 * GameDay Entry Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function GameDayEntryBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const router = useRouter();
  const gameDayData = event.instruments.gameday_entry.data;

  // If !canEnterGameDay OR entryHref is null: show muted statusText
  if (!policy.canEnterGameDay || !gameDayData.entryHref) {
    return (
      <div className="text-sm text-muted">
        {gameDayData.statusText || "GameDay unlocks on the day."}
      </div>
    );
  }

  // Else: render primary button with entryLabel
  const handleEnter = () => {
    if (gameDayData.entryHref) {
      router.push(gameDayData.entryHref);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleEnter}
        className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        {gameDayData.entryLabel}
      </button>
    </div>
  );
}
