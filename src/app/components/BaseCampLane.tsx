"use client";

import { useMemo, Fragment } from "react";
import type { EventContext, InstrumentKey } from "../lib/domain/event/eventTypes";
import type { EventPolicy } from "../lib/domain/policy/eventPolicy";
import type { Trip } from "../lib/tripActions";
import type { InlineInstrumentDefinition } from "../lib/domain/instruments/instrumentTypes";
import { getPhaseStatusLine } from "../lib/domain/lifecycle/phaseCopy";
import InlineInstrumentSection from "./InlineInstrumentSection";

type BaseCampInstrument = {
  id: string;
  isRelevant: boolean;
  isDone: boolean;
  label: string;
  renderLink?: (() => React.ReactElement) | null;
};

type BaseCampLaneProps = {
  event: EventContext | null;
  policy: EventPolicy | null;
  instruments: Record<InstrumentKey, InlineInstrumentDefinition>;
  baseCampInstruments: BaseCampInstrument[];
  currentUserId: string | null;
  supabase: any;
  activeGroupId: string | null;
  onTripUpdate: (updatedTrip: Trip) => void;
  canEdit: boolean;
  trip: Trip;
  isGroupTripPage: boolean;
  onShowBottomAnchorSheet: () => void;
};

export default function BaseCampLane({
  event,
  policy,
  instruments,
  baseCampInstruments,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
  canEdit,
  trip,
  isGroupTripPage,
  onShowBottomAnchorSheet,
}: BaseCampLaneProps) {
  // Domain instruments rendered inline in BaseCamp lane (ordered list)
  const baseCampDomainInstrumentKeys: InstrumentKey[] = [
    "trip_name",
    "logistics",
    "signups_window",
    "roster",
    "flights_plan",
    "participants",
    "meet_details",
    "gameday_entry",
    "results_publish",
    // add more as migrated: ...
  ];

  // Derive ordered domain keys (pin signups_window to top during sign-ups phase)
  const orderedDomainKeys = useMemo(() => {
    const keys = [...baseCampDomainInstrumentKeys];

    // During sign-ups window: pin signups_window to the top
    if (event?.state === "signups_open" || event?.state === "forming") {
      const idx = keys.indexOf("signups_window");
      if (idx > -1) {
        keys.splice(idx, 1);
        keys.unshift("signups_window");
      }
    }

    return keys;
  }, [event?.state, baseCampDomainInstrumentKeys]);

  // Helper to render an instrument with InlineInstrumentSection wrapper
  function renderInstrument(
    key: InstrumentKey,
    opts?: { id?: string; showDivider?: boolean; className?: string }
  ) {
    if (!event || !policy) return null;
    const def = instruments[key];
    if (!def || !def.isAvailable(event)) return null;

    // Use canonical id mapping: "meet_details" -> "meet-details" for anchor targeting
    const canonicalId = opts?.id || (key === "meet_details" ? "meet-details" : key);

    // Compute completion status ONLY when def.kind === "job"
    const done = def.kind === "job" ? def.isDone(event) : false;
    const status = def.kind === "job" ? (done ? "done" : "todo") : undefined;

    // Determine density: compact only for completed jobs with compactWhenDone flag
    const density =
      def.kind === "job" && done && def.compactWhenDone
        ? "compact"
        : "normal";

    const renderProps = {
      event,
      policy,
      currentUserId,
      supabase,
      activeGroupId,
      onTripUpdate,
    };

    return (
      <InlineInstrumentSection
        key={key}
        id={canonicalId}
        title={def.title}
        helper={def.helper}
        right={def.RightAction ? <def.RightAction {...renderProps} /> : undefined}
        showDivider={opts?.showDivider}
        className={opts?.className}
        status={status}
        density={density}
      >
        <def.RenderBody {...renderProps} />
      </InlineInstrumentSection>
    );
  }

  // Format date helper for anchors
  const formatDateForAnchor = (ymd: string): string => {
    const [year, month, day] = ymd.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
    const dayNum = dateObj.getUTCDate();
    const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
    return `${dayName} ${dayNum} ${mon}`;
  };

  if (!isGroupTripPage) {
    return null;
  }

  return (
    <section aria-label="Base Camp" className="mt-6">
      {/* Rail/spine begins here, not above chrome */}
      <div className="grid grid-cols-[28px_1fr] gap-x-3 sm:grid-cols-[40px_1fr]">
        {/* Row 1: Top anchor */}
        {/* Left cell: Current phase node + tick (spine starts here, no spine above) */}
        <div className="relative flex items-start">
          <div className="relative z-10 flex items-center pt-[0.375rem]">
            <div className="h-2.5 w-2.5 rounded-full bg-ink-700 ring-2 ring-ink-700/20 -translate-x-1/2" />
            <div className="absolute left-0 w-3 h-px bg-border translate-x-1/2" style={{ top: "6px" }} />
          </div>
          {/* Spine segment from top node down (connects to Row 2) */}
          <div className="absolute left-0 top-[1.125rem] bottom-0 w-px bg-border" />
        </div>
        {/* Right cell: Top anchor (system-owned statement) */}
        <div id="base-camp-top-anchor" className="pt-[0.375rem]">
          {(() => {
            if (!event) return null;

            const statusLine = getPhaseStatusLine(event.state, {
              opensAtText: event.instruments.signups_window.data.opensAtText,
              closesAtText: event.instruments.signups_window.data.closesAtText,
            });

            if (!statusLine) return null;

            return (
              <p className="text-sm text-muted-foreground">{statusLine}</p>
            );
          })()}
        </div>

        {/* Row 2: Between-anchor instrument lane (readiness) */}
        {/* Left cell: Spine segment (connects Row 1 to Row 3) */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        </div>
        {/* Right cell: Between-anchor content (instrument slots) - extra horizontal padding for breathing room */}
        <div className="mt-10 pb-10 pl-5">
          {event && event.state !== "gameday" && event.state !== "in_play" && event.state !== "completed" && (() => {
            // Filter legacy instruments (exclude domain instruments)
            const legacyActiveInstruments = baseCampInstruments
              .filter(i => i.isRelevant)
              .slice(0, 3)
              .filter(
                (instrument) =>
                  !baseCampDomainInstrumentKeys.includes(
                    instrument.id as InstrumentKey
                  )
              );

            // Filter domain instruments to only include available ones
            const availableDomainKeys = orderedDomainKeys.filter((key) => {
              const def = instruments[key];
              return Boolean(def) && def.isAvailable(event);
            });

            return (
              <div className="space-y-6">
                {/* Domain instruments: render via domain instrument system (inline lane) - independent of activeInstruments */}
                {availableDomainKeys.map((key, idx) => (
                  <Fragment key={key}>
                    {renderInstrument(key, {
                      id:
                        key === "meet_details"
                          ? "meet-details"
                          : key === "signups_window"
                          ? "signups-window"
                          : key === "roster"
                          ? "roster"
                          : key === "flights_plan"
                          ? "flights-plan"
                          : key === "trip_name"
                          ? "trip-name"
                          : key === "gameday_entry"
                          ? "gameday-entry"
                          : key === "results_publish"
                          ? "results-publish"
                          : key === "participants"
                          ? "participants"
                          : key === "logistics"
                          ? "logistics"
                          : key,
                      showDivider: idx < availableDomainKeys.length - 1,
                    })}
                  </Fragment>
                ))}

                {/* Legacy instruments */}
                {legacyActiveInstruments.map((instrument) => {
                  // Fallback: non-actionable instruments (should not happen in normal flow)
                  // Consistency: if done, show tick; if not done and not actionable, still show (read-only)
                  return (
                    <div key={instrument.id}>
                      <div className={`text-sm ${instrument.isDone ? "text-muted opacity-60" : "text-foreground"} flex items-center justify-between gap-2`}>
                        <span>{instrument.label}</span>
                        {instrument.isDone && (
                          <div className="shrink-0">
                            <svg className="h-4 w-4 text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        {!instrument.isDone && instrument.renderLink && instrument.renderLink()}
                      </div>
                    </div>
                  );
                })}
                {/* Instrument-driven muted past lines (only show after moment state changes) */}
                {/* Note: completed instruments stay in-lane until moment change, so past lines are minimal */}
              </div>
            );
          })()}
        </div>

        {/* Row 3: Bottom anchor (next moment) - only render if event.state is not completed */}
        {event && event.state !== "completed" && (
          <>
            {/* Left cell: Next moment node + tick (spine from Row 2 connects here, stops at node) */}
            <div className="relative flex items-start">
              {/* Small spine segment above node (connects from Row 2) */}
              <div className="absolute left-0 top-0 w-px bg-border" style={{ height: "0.5rem" }} />
              {/* Next moment node (muted/hollow) */}
              <div className="relative z-10 flex items-center pt-[0.375rem]">
                <div className="h-2.5 w-2.5 rounded-full border-2 border-border bg-transparent -translate-x-1/2" />
                <div className="absolute left-0 w-3 h-px bg-border translate-x-1/2" style={{ top: "6px" }} />
              </div>
              {/* Spine stops at bottom node (no continuation below) */}
            </div>
            {/* Right cell: Bottom anchor (next moment statement, may be actionable) */}
            <div id="base-camp-bottom-anchor" className="pt-[0.375rem]">
              {event && (() => {
                // Compute anchor actionability (host/admin only)
                const bottomAnchorIsActionable =
                  canEdit && (event.state === "forming" || event.state === "signups_open");

                // Bottom anchor text mapping
                let bottomAnchorText: string | null = null;
                switch (event.state) {
                  case "forming":
                    bottomAnchorText = null; // Sign-ups info now shown in signups_window instrument
                    break;
                  case "signups_open":
                    bottomAnchorText = null; // Sign-ups info now shown in signups_window instrument
                    break;
                  case "locked":
                    bottomAnchorText = `GameDay on ${formatDateForAnchor(trip.date)}.`;
                    break;
                  case "gameday":
                  case "in_play":
                    // GameDay entry now handled by gameday_entry instrument
                    bottomAnchorText = null;
                    break;
                  default:
                    bottomAnchorText = null;
                }

                if (!bottomAnchorText) return null;

                return bottomAnchorIsActionable ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!bottomAnchorIsActionable) return;
                      onShowBottomAnchorSheet();
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && bottomAnchorIsActionable) {
                        e.preventDefault();
                        onShowBottomAnchorSheet();
                      }
                    }}
                    className="w-full text-sm text-muted opacity-60 font-medium flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer"
                  >
                    <span>{bottomAnchorText}</span>
                    {bottomAnchorIsActionable && (
                      <div className="shrink-0 opacity-60">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted opacity-60 font-medium">
                    {bottomAnchorText}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
