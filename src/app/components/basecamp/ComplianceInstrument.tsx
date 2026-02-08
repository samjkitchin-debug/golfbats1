"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { EventContext } from "../../lib/domain/event/eventTypes";
import type { EventPolicy } from "../../lib/domain/policy/eventPolicy";

/**
 * v1 Compliance "instrument" (BaseCamp-only).
 * Not part of InstrumentKey union. Shows travel-docs summary and missing list;
 * no inline passport edit; link to /me for members to add their own details.
 */

type ComplianceApiResponse = {
  tripId?: number;
  required?: boolean;
  summary?: { total: number; complete: number; missing: number };
  missing?: Array<{ memberId: string; displayName: string; missingFields: string[] }>;
};

type ComplianceInstrumentProps = {
  event: EventContext;
  policy: EventPolicy;
};

export function ComplianceInstrument({ event, policy }: ComplianceInstrumentProps) {
  if (!policy.canAccessBaseCamp || !event.requirements?.travelDocsRequired) {
    return null;
  }

  const tripId = (event.trip as { legacy_id?: number }).legacy_id ?? event.trip.id;
  const tripIdStr = typeof tripId === "number" ? String(tripId) : String(tripId);

  const [data, setData] = useState<ComplianceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchCompliance() {
      try {
        const res = await fetch(`/api/trips/${tripIdStr}/compliance`, {
          credentials: "include",
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        }
      } catch (e) {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCompliance();
    return () => {
      cancelled = true;
    };
  }, [tripIdStr]);

  if (loading) {
    return (
      <div className="text-sm text-muted">
        <p>Loading travel docs status…</p>
      </div>
    );
  }

  const summary = data?.summary;
  const missingList = data?.missing ?? [];
  const total = summary?.total ?? 0;
  const complete = summary?.complete ?? 0;
  const missingCount = summary?.missing ?? missingList.length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-foreground">
        <span className="text-muted">Total:</span> {total} ·{" "}
        <span className="text-[rgb(var(--brand-green))]">Complete:</span> {complete} ·{" "}
        <span className="text-foreground">Missing:</span> {missingCount}
      </div>
      {missingCount > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">Missing travel docs</div>
          <ul className="list-none space-y-1">
            {missingList.map((item) => (
              <li key={item.memberId} className="text-sm text-foreground">
                {item.displayName}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Members can add their passport details on their profile.
          </p>
          <Link
            href="/me"
            className="inline-block text-sm text-anticipation hover:underline"
          >
            Go to profile →
          </Link>
        </div>
      )}
    </div>
  );
}
