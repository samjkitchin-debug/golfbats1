"use client";

import { useMemo, Fragment } from "react";
import type { EventContext, InstrumentKey } from "../lib/domain/event/eventTypes";
import type { EventPolicy } from "../lib/domain/policy/eventPolicy";
import type { Trip } from "../lib/tripActions";
import type { InlineInstrumentDefinition } from "../lib/domain/instruments/instrumentTypes";
import InlineInstrumentSection from "./InlineInstrumentSection";
import { getPhaseLabel, getNextPhasePreview, formatDateForAnchor } from "../lib/domain/event/phaseDisplay";

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
  saveTripPatch: (patch: Partial<Trip>) => Promise<{ ok: true; trip: Trip } | { ok: false; error: string }>;
  canEdit: boolean;
  trip: Trip;
  isGroupTripPage: boolean;
  onOpenSignupsRequested: () => void;
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
  saveTripPatch,
  canEdit,
  trip,
  isGroupTripPage,
  onOpenSignupsRequested,
}: BaseCampLaneProps) {
  // Phase-scoped instrument ordering (deterministic per phase)
  const getOrderedKeysForPhase = (phase: EventContext["state"] | null): InstrumentKey[] => {
    switch (phase) {
      case "forming":
        return ["trip_name", "capacity" as InstrumentKey];
      case "signups_open":
        return ["roster"];
      case "locked":
        return ["flights_plan", "logistics", "export_docs" as InstrumentKey, "meet_details"];
      case "gameday":
        return ["gameday_entry"];
      case "completed":
        return ["results_publish"];
      default:
        return [];
    }
  };

  // Get ordered keys for current phase
  const orderedDomainKeys = useMemo(() => {
    if (!event) return [];
    return getOrderedKeysForPhase(event.state);
  }, [event?.state]);

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
      saveTripPatch,
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

  // Phase labels and previews now come from centralized phaseDisplay module

  // BaseCamp is organiser-only: require both group trip AND basecamp access permission
  if (!isGroupTripPage || !policy?.canAccessBaseCamp) {
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
            <div className="h-2.5 w-2.5 rounded-full bg-anticipation ring-2 ring-anticipation/20 -translate-x-1/2" />
            <div className="absolute left-0 w-3 h-px bg-border translate-x-1/2" style={{ top: "6px" }} />
          </div>
          {/* Spine segment from top node down (connects to Row 2) */}
          <div className="absolute left-0 top-[1.125rem] bottom-0 w-px bg-border" />
        </div>
            {/* Right cell: Top anchor (system-owned statement) */}
        <div id="base-camp-top-anchor" className="pt-[0.375rem]">
          {event && (() => {
            const topLabel = getPhaseLabel(event.state);
            
            // Dev-only invariant check for anchor consistency
            if (process.env.NODE_ENV !== "production") {
              // Top label must match current state
              const expectedTopLabel = getPhaseLabel(event.state);
              if (topLabel !== expectedTopLabel) {
                console.error("[BaseCamp] Top anchor label mismatch:", {
                  state: event.state,
                  label: topLabel,
                  expected: expectedTopLabel,
                });
              }
            }
            
            return (
              <div className="text-sm text-foreground font-medium">
                {topLabel}
              </div>
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
          {event && (() => {
            // Filter domain instruments: only render if:
            // 1. Key is in the ordering list for current phase, AND
            // 2. Registry isAvailable(event) returns true
            const availableDomainKeys = orderedDomainKeys.filter((key) => {
              const def = instruments[key];
              if (!def) return false; // Instrument doesn't exist in registry yet (e.g., capacity, export_docs)
              return def.isAvailable(event);
            });

            if (availableDomainKeys.length === 0) return null;

            return (
              <div className="space-y-6">
                {/* Domain instruments: render via domain instrument system (inline lane) */}
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
                          : key === "logistics"
                          ? "logistics"
                          : key === "capacity"
                          ? "capacity"
                          : key === "export_docs"
                          ? "export-docs"
                          : key,
                      showDivider: idx < availableDomainKeys.length - 1,
                    })}
                  </Fragment>
                ))}
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
            {/* Right cell: Bottom anchor (next phase preview with date) */}
            <div id="base-camp-bottom-anchor" className="pt-[0.375rem]">
              {event && (() => {
                // Compute next phase preview from centralized mapping
                const phaseCtx = {
                  opensAtText: event.instruments.signups_window.data.opensAtText,
                  closesAtText: event.instruments.signups_window.data.closesAtText,
                  tripDate: event.date,
                  tripDateText: formatDateForAnchor(event.date),
                };

                const nextPreview = getNextPhasePreview(event.state, phaseCtx);

                // If no next phase (completed), render nothing
                if (!nextPreview) return null;

                // Dev-only invariant check: catch mixed-state anchor bugs
                if (process.env.NODE_ENV !== "production") {
                  const bottomPreviewLine = nextPreview.line;
                  
                  // forming state must never show "Sign-ups close" preview
                  if (event.state === "forming" && bottomPreviewLine?.includes("Sign-ups close")) {
                    console.error("[BaseCamp] Invalid anchor preview: forming cannot show sign-ups close preview", {
                      state: event.state,
                      previewLine: bottomPreviewLine,
                      opensAtText: phaseCtx.opensAtText,
                      closesAtText: phaseCtx.closesAtText,
                    });
                  }
                  
                  // signups_open state must never show "Sign-ups open" preview (that's for forming)
                  if (event.state === "signups_open" && bottomPreviewLine?.includes("Sign-ups open on")) {
                    console.error("[BaseCamp] Invalid anchor preview: signups_open cannot show sign-ups open preview", {
                      state: event.state,
                      previewLine: bottomPreviewLine,
                    });
                  }
                  
                  // Bottom preview must correspond to next state from current state
                  const expectedNextState = (() => {
                    switch (event.state) {
                      case "forming": return "signups_open";
                      case "signups_open": return "locked";
                      case "locked": return "gameday";
                      case "gameday": return "in_play";
                      case "in_play": return "completed";
                      default: return null;
                    }
                  })();
                  
                  if (expectedNextState && nextPreview.label !== getPhaseLabel(expectedNextState)) {
                    console.error("[BaseCamp] Bottom preview label mismatch:", {
                      currentState: event.state,
                      expectedNextState,
                      previewLabel: nextPreview.label,
                      expectedLabel: getPhaseLabel(expectedNextState),
                    });
                  }
                }

                // Compute anchor actionability (host/admin only)
                const bottomAnchorIsActionable =
                  canEdit && (event.state === "forming" || event.state === "signups_open");

                // Render next phase preview line
                // When actionable (forming state), clicking directly triggers AlertDialog
                return bottomAnchorIsActionable ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!bottomAnchorIsActionable) return;
                      // Directly trigger AlertDialog for open sign-ups
                      if (event.state === "forming") {
                        onOpenSignupsRequested();
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && bottomAnchorIsActionable) {
                        e.preventDefault();
                        if (event.state === "forming") {
                          onOpenSignupsRequested();
                        }
                      }
                    }}
                    className="w-full text-sm text-foreground font-medium flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer"
                  >
                    <span>{nextPreview.line}</span>
                    {bottomAnchorIsActionable && (
                      <div className="shrink-0">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-foreground font-medium">
                    {nextPreview.line}
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
