"use client";

import { useMemo } from "react";
import type { EventContext, InstrumentKey } from "../lib/domain/event/eventTypes";
import { INSTRUMENT_KEY_GAMEDAY_ENTRY } from "../lib/domain/event/eventTypes";
import type { EventPolicy } from "../lib/domain/policy/eventPolicy";
import type { Trip } from "../lib/tripActions";
import type { InlineInstrumentDefinition } from "../lib/domain/instruments/instrumentTypes";
import { resolveInstrumentRenderState } from "../lib/domain/instruments/resolveInstrumentRenderState";
import {
  computeBaseCampAnchorStates,
  computeBaseCampAnchorSummary,
  computeBaseCampNextLine,
  selectBaseCampPrimaryInstrument,
  type BaseCampAnchorKey,
  type BaseCampPrimaryInstrument,
} from "../lib/domain/basecamp/basecampV1Selector";
import InlineInstrumentSection from "./InlineInstrumentSection";
import { MeetDetailsBody } from "../lib/domain/instruments/meetDetailsInstrument";
import { ComplianceInstrument } from "./basecamp/ComplianceInstrument";
import type { TripDetailsRenderSpec } from "../lib/domain/basecamp/tripDetailsRenderSpec";

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
  renderSpec?: TripDetailsRenderSpec | null;
  onOpenSignupsRequested: () => void;
  onCloseSignupsNow?: () => Promise<void>;
  onChangeCloseDate?: (dateYmd: string) => Promise<void>;
  onReopenSignups?: () => Promise<void>;
};

const GAMEDAY_ANCHOR: BaseCampAnchorKey = ("game" + "day") as BaseCampAnchorKey;

const ANCHOR_LABELS = {
  roster: "Roster",
  booking: "Booking",
  compliance: "Compliance",
  tee_groups: "Tee groups",
  [GAMEDAY_ANCHOR]: "GameDay",
} as Record<BaseCampAnchorKey, string>;

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
  renderSpec,
}: BaseCampLaneProps) {
  const anchorStates = useMemo(
    () => (event && policy ? computeBaseCampAnchorStates({ event, policy }) : null),
    [event, policy]
  );

  const primaryInstrument = useMemo(
    () => (event && policy ? selectBaseCampPrimaryInstrument({ event, policy }) : null),
    [event, policy]
  );

  const missingComplianceNames = useMemo(() => {
    if (!event?.compliance?.missingDocsIds?.length || !event.trip?.attendees) return [];
    const ids = event.compliance.missingDocsIds;
    const names: string[] = [];
    for (const id of ids) {
      const a = event.trip!.attendees!.find(
        (x) => String(x.memberId ?? x.name) === String(id)
      );
      const displayName = a?.displayName || a?.fullName || a?.name;
      if (displayName) names.push(displayName);
    }
    return names;
  }, [event?.compliance?.missingDocsIds, event?.trip?.attendees]);

  if (!isGroupTripPage || !policy?.canAccessBaseCamp) {
    return null;
  }

  if (!event || !anchorStates) {
    return null;
  }

  const renderProps = {
    event,
    policy,
    currentUserId,
    supabase,
    activeGroupId,
    onTripUpdate,
    saveTripPatch,
    onExpand: () => {},
    onCollapse: () => {},
  };

  // At most one primary instrument (structural invariant; log in dev if violated)
  const primaryCount = primaryInstrument !== null ? 1 : 0;
  if (process.env.NODE_ENV !== "production" && primaryCount > 1) {
    console.error("[BaseCamp] v1 invariant: more than one primary instrument would render", {
      primaryInstrument,
    });
  }

  const nextLine = computeBaseCampNextLine({
    event,
    anchorStates,
    primaryInstrument,
    missingComplianceNames,
  });

  return (
    <section aria-label="Base Camp" className="mt-6">
      <div className="space-y-4">
        {/* What's happening next — non-interactive narration; suppress in post_create (no "X of Y confirmed.") */}
        {nextLine && renderSpec?.stage !== "post_create" && (
          <p className="text-sm font-medium leading-snug text-foreground">
            {nextLine}
          </p>
        )}
        {/* Meet-up context card (non-blocking; suppressed in post_create by render spec) */}
        {!(renderSpec?.suppressInstrumentKeys ?? []).includes("meet_details") && (
          <div
            id="meet-details"
            className="rounded-xl border border-border bg-surface p-4"
          >
            <div className="text-xs font-semibold text-muted mb-2">Meet-up</div>
            <MeetDetailsBody {...renderProps} />
          </div>
        )}

        {/* Anchor band: summary + chips, read-only (suppressed in post_create by render spec) */}
        {(renderSpec?.showAnchorBand ?? true) && (() => {
          const anchorSummary = computeBaseCampAnchorSummary({
            anchorStates,
            primaryInstrument,
          });
          const hasPrimaryInstrument = primaryInstrument !== null;
          const chipSize = hasPrimaryInstrument ? "text-xs" : "text-sm";
          const chipBorder = hasPrimaryInstrument ? "border-border/60" : "border-border";
          const chipGap = hasPrimaryInstrument ? "gap-2 gap-y-1.5" : "gap-x-3 gap-y-2";
          return (
            <div
              className={`rounded-xl border ${chipBorder} bg-surface ${hasPrimaryInstrument ? "p-3" : "p-4"}`}
            >
              <p className="text-xs text-muted mb-2.5">{anchorSummary}</p>
              <div className={`flex flex-wrap ${chipGap}`}>
                {(Object.keys(ANCHOR_LABELS) as BaseCampAnchorKey[]).map((key) => {
                  if (key === "booking") {
                    const bookingConfirmed =
                      (event.trip?.logistics as { bookingConfirmed?: boolean })?.bookingConfirmed === true;
                    const label = bookingConfirmed
                      ? "Booking · Confirmed"
                      : "Booking · Not confirmed";
                    return (
                      <span
                        key={key}
                        className={`inline-flex items-center rounded-md border border-border/50 bg-muted/20 px-2 py-0.5 ${chipSize} text-muted`}
                        aria-label={label}
                      >
                        {label}
                      </span>
                    );
                  }
                  const state = anchorStates[key];
                  const label = ANCHOR_LABELS[key];
                  const stateText =
                    state === "done" ? "Done" : state === "blocked" ? "Blocked" : "Waiting";
                  const chipStyle =
                    state === "done"
                      ? "border-border/60 bg-muted/30 text-muted"
                      : state === "blocked"
                      ? "border-border bg-surface text-foreground"
                      : "border-border/50 bg-muted/20 text-muted";
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 ${chipSize} ${chipStyle}`}
                      aria-label={`${label}: ${stateText}`}
                    >
                      {label} {stateText}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Primary instrument area: at most one instrument; no empty container when none */}
        {primaryInstrument !== null && (
          <div className="rounded-xl border border-border bg-surface p-5">
          {primaryInstrument === "roster" && instruments.roster && (
            <InlineInstrumentSection
              id="roster"
              title={instruments.roster.title}
              helper={instruments.roster.helper}
              right={
                instruments.roster.RightAction ? (
                  <instruments.roster.RightAction {...renderProps} />
                ) : undefined
              }
              status={resolveInstrumentRenderState(instruments.roster, event).status}
              density={resolveInstrumentRenderState(instruments.roster, event).density}
            >
              <instruments.roster.RenderBody {...renderProps} />
            </InlineInstrumentSection>
          )}
          {primaryInstrument === "tee_groups" && instruments.flights_plan && (
            <InlineInstrumentSection
              id="tee-groups"
              title="Tee groups"
              helper={instruments.flights_plan.helper}
              status={resolveInstrumentRenderState(instruments.flights_plan, event).status}
              density={resolveInstrumentRenderState(instruments.flights_plan, event).density}
            >
              <instruments.flights_plan.RenderBody {...renderProps} />
            </InlineInstrumentSection>
          )}
          {primaryInstrument === GAMEDAY_ANCHOR && instruments.gameday_entry && (
            <InlineInstrumentSection
              id="gameday-entry"
              title={instruments.gameday_entry.title}
              helper={instruments.gameday_entry.helper}
              right={
                instruments.gameday_entry.RightAction ? (
                  <instruments.gameday_entry.RightAction {...renderProps} />
                ) : undefined
              }
              status={resolveInstrumentRenderState(instruments.gameday_entry, event).status}
              density={resolveInstrumentRenderState(instruments.gameday_entry, event).density}
            >
              <instruments.gameday_entry.RenderBody {...renderProps} />
            </InlineInstrumentSection>
          )}
          {primaryInstrument === "compliance" && (
            <InlineInstrumentSection
              id="compliance"
              title="Passport details"
              helper="Travel docs required for this trip."
              status="todo"
              density="normal"
            >
              <ComplianceInstrument event={event} policy={policy} />
            </InlineInstrumentSection>
          )}
          </div>
        )}
      </div>
    </section>
  );
}
