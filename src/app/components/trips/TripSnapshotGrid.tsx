"use client";

/**
 * Trip Snapshot Grid — presentational label/value grid.
 * Used by Trips expanded row, Trip Details chroma, and shared snapshot consumers.
 * See docs/canon/trip-canonical-and-snapshots.md and trip-details-snapshot-header.md.
 */

import type { TripSnapshotRow } from "../../lib/trips/tripSnapshot";

export type SnapshotRow = TripSnapshotRow;

export default function TripSnapshotGrid({ rows }: { rows: TripSnapshotRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rows.map(({ key, label, value }) => (
        <div
          key={key}
          className="grid grid-cols-[96px_1fr] gap-x-3 items-baseline"
        >
          <span className="text-xs font-medium leading-4 text-ink-700 shrink-0">
            {label}
          </span>
          <span className="text-[13px] font-medium leading-[18px] text-ink-900 min-w-0 truncate">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
