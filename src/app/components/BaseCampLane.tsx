"use client";

import { useMemo, Fragment, useState } from "react";
import type { EventContext, InstrumentKey } from "../lib/domain/event/eventTypes";
import type { EventPolicy } from "../lib/domain/policy/eventPolicy";
import type { Trip } from "../lib/tripActions";
import type { InlineInstrumentDefinition } from "../lib/domain/instruments/instrumentTypes";
import { resolveInstrumentRenderState } from "../lib/domain/instruments/resolveInstrumentRenderState";
import { getOrderedVisibleKeys, isInstrumentVisible } from "../lib/domain/instruments/instrumentVisibility";
import InlineInstrumentSection from "./InlineInstrumentSection";
import AnchorRow from "./AnchorRow";
import {
  getPhaseLabel,
  getNextPhasePreview,
  formatDateForAnchor,
  isBottomAnchorVisible,
  isReopenChevronActive,
  isSignupsAnchorActionable,
  isSignupsOpen,
  isReopenModalForPhase,
  isForming,
  getExpectedNextState,
} from "../lib/domain/event/phaseDisplay";

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
  onCloseSignupsNow?: () => Promise<void>;
  onChangeCloseDate?: (dateYmd: string) => Promise<void>;
  onReopenSignups?: () => Promise<void>;
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
  onCloseSignupsNow,
  onChangeCloseDate,
  onReopenSignups,
}: BaseCampLaneProps) {
  const [expandedInstrumentKey, setExpandedInstrumentKey] = useState<InstrumentKey | null>(null);

  const orderedDomainKeys = useMemo(() => {
    if (!event || !instruments) return [];
    return getOrderedVisibleKeys(instruments, event.state, event, expandedInstrumentKey);
  }, [event, instruments, expandedInstrumentKey]);

  type SignupsModalStep = "choice" | "change_date";
  const [signupsModalOpen, setSignupsModalOpen] = useState(false);
  const [signupsModalStep, setSignupsModalStep] = useState<SignupsModalStep>("choice");
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [signupsDateYmd, setSignupsDateYmd] = useState("");
  const [signupsBusy, setSignupsBusy] = useState(false);

  const closeSignupsModal = () => {
    setSignupsModalOpen(false);
    setSignupsModalStep("choice");
    setSignupsError(null);
    setSignupsDateYmd("");
  };

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Helper to render an instrument with InlineInstrumentSection wrapper.
  // Visibility from isInstrumentVisible; behaviour from resolveInstrumentRenderState.
  function renderInstrument(
    key: InstrumentKey,
    opts?: { id?: string; showDivider?: boolean; className?: string }
  ) {
    if (!event || !policy) return null;
    const def = instruments[key];
    if (!def || !isInstrumentVisible(def, event.state)) return null;

    const canonicalId = opts?.id || (key === "meet_details" ? "meet-details" : key);
    const { status, density } = resolveInstrumentRenderState(def, event);

    const renderProps = {
      event,
      policy,
      currentUserId,
      supabase,
      activeGroupId,
      onTripUpdate,
      saveTripPatch,
      onExpand: () => setExpandedInstrumentKey(key),
      onCollapse: () => setExpandedInstrumentKey(null),
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
      <div className="grid grid-cols-[14px_1fr] gap-x-3 sm:grid-cols-[20px_1fr]">
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
            const topAnchorReopenable = canEdit && isReopenChevronActive(event.state) && !!onReopenSignups;

            if (process.env.NODE_ENV !== "production") {
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
              <AnchorRow
                text={topLabel}
                showChevron={topAnchorReopenable}
                chevronDirection="up"
                onChevronClick={topAnchorReopenable ? () => { setReopenError(null); setReopenModalOpen(true); } : undefined}
                chevronAriaLabel="Re-open sign-ups"
              />
            );
          })()}
        </div>

        {/* Row 2: Between-anchor instrument lane (readiness) */}
        {/* Left cell: Spine segment (connects Row 1 to Row 3) */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        </div>
        {/* Right cell: Between-anchor content (instrument slots) - extra horizontal padding for breathing room */}
        <div className="mt-5 pb-5 pl-4">
          {event && (() => {
            const availableDomainKeys = orderedDomainKeys;

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

        {/* Row 3: Bottom anchor (next moment) - visible when not completed */}
        {event && isBottomAnchorVisible(event.state) && (
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
                const phaseCtx = {
                  opensAtText: event.instruments.signups_window.data.opensAtText,
                  closesAtText: event.instruments.signups_window.data.closesAtText,
                  tripDate: event.date,
                  tripDateText: formatDateForAnchor(event.date),
                };
                const nextPreview = getNextPhasePreview(event.state, phaseCtx);
                if (!nextPreview) return null;

                if (process.env.NODE_ENV !== "production") {
                  const bottomPreviewLine = nextPreview.line;
                  const phase = event.state;
                  if (isForming(phase) && bottomPreviewLine?.includes("Sign-ups close")) {
                    console.error("[BaseCamp] Invalid anchor preview: forming cannot show sign-ups close preview", {
                      state: phase,
                      previewLine: bottomPreviewLine,
                      opensAtText: phaseCtx.opensAtText,
                      closesAtText: phaseCtx.closesAtText,
                    });
                  }
                  if (isSignupsOpen(phase) && bottomPreviewLine?.includes("Sign-ups open on")) {
                    console.error("[BaseCamp] Invalid anchor preview: signups_open cannot show sign-ups open preview", {
                      state: phase,
                      previewLine: bottomPreviewLine,
                    });
                  }
                  const expectedNextState = getExpectedNextState(phase);
                  if (expectedNextState && nextPreview.label !== getPhaseLabel(expectedNextState)) {
                    console.error("[BaseCamp] Bottom preview label mismatch:", {
                      currentState: phase,
                      expectedNextState,
                      previewLabel: nextPreview.label,
                      expectedLabel: getPhaseLabel(expectedNextState),
                    });
                  }
                }

                const bottomAnchorIsActionable = canEdit && isSignupsAnchorActionable(event.state);
                const openSignupsModal = () => {
                  setSignupsError(null);
                  setSignupsModalStep("choice");
                  setSignupsModalOpen(true);
                };
                const handleChevronClick = () => {
                  if (!bottomAnchorIsActionable) return;
                  if (isSignupsOpen(event.state)) openSignupsModal();
                  else if (isForming(event.state)) onOpenSignupsRequested();
                };

                return (
                  <AnchorRow
                    text={nextPreview.line}
                    showLineAsButton={bottomAnchorIsActionable && isForming(event.state)}
                    onLineClick={bottomAnchorIsActionable && isForming(event.state) ? onOpenSignupsRequested : undefined}
                    showChevron={bottomAnchorIsActionable}
                    chevronDirection="down"
                    onChevronClick={bottomAnchorIsActionable ? handleChevronClick : undefined}
                    chevronAriaLabel="Sign-ups"
                  />
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* Sign-ups modal (signups_open only): choice or change date */}
      {signupsModalOpen && event && isSignupsOpen(event.state) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            {signupsModalStep === "choice" && (
              <>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Sign-ups</h3>
                <p className="mb-6 text-sm text-muted">Sign-ups are currently open.</p>
                {signupsError && (
                  <p className="mb-4 text-sm text-danger">{signupsError}</p>
                )}
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onCloseSignupsNow) return;
                      setSignupsBusy(true);
                      setSignupsError(null);
                      try {
                        await onCloseSignupsNow();
                        closeSignupsModal();
                      } catch (e) {
                        setSignupsError(e instanceof Error ? e.message : "Failed to close sign-ups.");
                      } finally {
                        setSignupsBusy(false);
                      }
                    }}
                    disabled={signupsBusy}
                    className="w-full rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {signupsBusy ? "Closing…" : "Close sign-ups now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignupsError(null);
                      const iso = event.instruments.signups_window?.data?.closeMomentIso;
                      if (iso) {
                        const d = new Date(iso);
                        const sgt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
                        const y = sgt.getUTCFullYear();
                        const m = String(sgt.getUTCMonth() + 1).padStart(2, "0");
                        const day = String(sgt.getUTCDate()).padStart(2, "0");
                        setSignupsDateYmd(`${y}-${m}-${day}`);
                      } else {
                        setSignupsDateYmd("");
                      }
                      setSignupsModalStep("change_date");
                    }}
                    disabled={signupsBusy}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
                  >
                    Change close date
                  </button>
                  <button
                    type="button"
                    onClick={closeSignupsModal}
                    disabled={signupsBusy}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
                </>
                )}
                {signupsModalStep === "change_date" && (
                  <>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">Change close date</h3>
                    <p className="mb-4 text-sm text-muted">Pick the date sign-ups will close (23:59 SGT).</p>
                    {signupsError && (
                      <p className="mb-4 text-sm text-danger">{signupsError}</p>
                    )}
                    <input
                      type="date"
                      value={signupsDateYmd}
                      onChange={(e) => setSignupsDateYmd(e.target.value)}
                      className="mb-6 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-anticipation focus:outline-none"
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSignupsModalStep("choice");
                          setSignupsError(null);
                        }}
                        className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!onChangeCloseDate || !signupsDateYmd) return;
                          setSignupsBusy(true);
                          setSignupsError(null);
                          try {
                            await onChangeCloseDate(signupsDateYmd);
                            closeSignupsModal();
                          } catch (e) {
                            setSignupsError(e instanceof Error ? e.message : "Failed to update close date.");
                          } finally {
                            setSignupsBusy(false);
                          }
                        }}
                        disabled={signupsBusy || !signupsDateYmd}
                        className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90"
                      >
                        Set
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
      )}

      {/* Re-open sign-ups modal (locked phase only) */}
      {reopenModalOpen && event && isReopenModalForPhase(event.state) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Re-open sign-ups?</h3>
            <p className="mb-6 text-sm text-muted">Sign-ups will re-open immediately.</p>
            {reopenError && (
              <p className="mb-4 text-sm text-danger">{reopenError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setReopenModalOpen(false);
                  setReopenError(null);
                }}
                disabled={reopenBusy}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!onReopenSignups) return;
                  setReopenBusy(true);
                  setReopenError(null);
                  try {
                    await onReopenSignups();
                    setReopenModalOpen(false);
                    setReopenError(null);
                  } catch (e) {
                    setReopenError(e instanceof Error ? e.message : "Failed to re-open sign-ups.");
                  } finally {
                    setReopenBusy(false);
                  }
                }}
                disabled={reopenBusy}
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Re-open
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
