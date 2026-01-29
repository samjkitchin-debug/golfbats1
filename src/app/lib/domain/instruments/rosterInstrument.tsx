"use client";

import { useState, useMemo, useEffect } from "react";
import type { InstrumentRenderProps } from "./instrumentTypes";

/**
 * Roster (Attendees) instrument — status only, exception-first, stable hierarchy.
 * Organiser glance: (1) confirmed count (2) who blocks export (3) optional roster.
 * No job/task actions, no inline passport fields, no Mark complete.
 * See: frozen v1 spec (docs/canon).
 */

const REASON_MISSING_TRAVEL = "missing travel details";

export function RosterBody({
  event,
  policy,
}: InstrumentRenderProps) {
  const rosterData = event.instruments.roster.data;
  const confirmedCount = rosterData.confirmedCount;

  const [complianceData, setComplianceData] = useState<{
    tripId: number;
    required: boolean;
    summary: { total: number; complete: number; missing: number };
    missing: Array<{ memberId: string; displayName: string; missingFields: string[] }>;
  } | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [rosterExpanded, setRosterExpanded] = useState(false);

  const travelDocsRequired = event.requirements?.travelDocsRequired ?? false;
  const isOrganiser = policy.canAccessBaseCamp;

  useEffect(() => {
    if (!travelDocsRequired || !isOrganiser) {
      setComplianceData(null);
      return;
    }

    async function loadCompliance() {
      setComplianceLoading(true);
      try {
        const res = await fetch(`/api/trips/${event.trip.id}/compliance`, {
          credentials: "include",
        });
        if (res.status === 403) {
          setComplianceData(null);
          return;
        }
        if (!res.ok) throw new Error(`Compliance ${res.status}`);
        const data = await res.json();
        setComplianceData(data);
      } catch {
        setComplianceData(null);
      } finally {
        setComplianceLoading(false);
      }
    }

    loadCompliance();
  }, [travelDocsRequired, isOrganiser, event.trip.id]);

  const needsAttentionCount = complianceData?.summary?.missing ?? 0;
  const exceptionList = useMemo(() => {
    const list = complianceData?.missing ?? [];
    return list.map((m) => ({
      memberId: m.memberId,
      name: m.displayName,
      reason: REASON_MISSING_TRAVEL,
    }));
  }, [complianceData?.missing]);

  const attentionState =
    !travelDocsRequired || !isOrganiser
      ? "all details complete"
      : complianceLoading
        ? "…"
        : needsAttentionCount > 0
          ? `${needsAttentionCount} needs attention`
          : "all details complete";

  const confirmed = useMemo(() => {
    return (event.trip.attendees ?? [])
      .filter((a) => a.status === "confirmed")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [event.trip.attendees]);

  return (
    <div className="space-y-0">
      {/* A) Header — 16px / 600 / 20px / ink-900, mb 8px */}
      <h3 className="text-base font-semibold leading-5 text-ink-900 mb-2">
        Attendees
      </h3>

      {/* B) Primary status line — always present, 14px / 500 / 18px / ink-800 (use ink-700), mb 10px */}
      <p className="text-sm font-medium leading-[18px] text-ink-700 mb-2.5">
        {confirmedCount} confirmed · {attentionState}
      </p>

      {/* C) Exception block — only if needsAttentionCount > 0 */}
      {needsAttentionCount > 0 && (
        <div className="pt-2 pb-2 mb-0 border-l-2 border-ink-300 pl-3">
          <div className="text-xs font-medium leading-4 text-ink-700 mb-1">
            Needs attention
          </div>
          <ul className="space-y-0.5 list-none">
            {exceptionList.map(({ memberId, name, reason }) => (
              <li
                key={memberId}
                className="text-[13px] font-normal leading-[18px] text-ink-900"
              >
                • {name} — {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* D) Roster disclosure — collapsed by default */}
      <div className="mt-1.5">
        <button
          type="button"
          onClick={() => setRosterExpanded((x) => !x)}
          className="flex items-center gap-1.5 text-left text-[13px] font-medium leading-[18px] text-ink-700 hover:opacity-80"
          aria-expanded={rosterExpanded}
        >
          <span>Roster ({confirmedCount})</span>
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={rosterExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
            />
          </svg>
        </button>
        {rosterExpanded && confirmed.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 list-none pl-0">
            {confirmed.map((a) => (
              <li
                key={a.memberId ?? a.name}
                className="text-[13px] font-normal leading-[18px] text-ink-900"
              >
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
