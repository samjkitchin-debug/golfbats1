/**
 * BaseCamp v1 Selector
 *
 * Pure logic for BaseCamp anchor states and primary instrument selection.
 * Single source of truth: docs/canon/basecamp-v1.md.
 * No React dependency; reusable for Agent read-only projection.
 */

import type { EventContext } from "../event/eventTypes";
import type { EventPolicy } from "../policy/eventPolicy";

export type BaseCampAnchorKey =
  | "roster"
  | "booking"
  | "compliance"
  | "tee_groups"
  | "gameday";

export type BaseCampAnchorState = "done" | "floating" | "blocked";

export type BaseCampPrimaryInstrument =
  | "roster"
  | "booking"
  | "compliance"
  | "tee_groups"
  | "gameday"
  | null;

const ANCHOR_KEYS: BaseCampAnchorKey[] = [
  "roster",
  "booking",
  "compliance",
  "tee_groups",
  "gameday",
];

/**
 * Compute anchor state for each BaseCamp anchor.
 * If policy does not allow BaseCamp access, returns all "done" (no blocking surface).
 */
export function computeBaseCampAnchorStates(args: {
  event: EventContext;
  policy: EventPolicy | null;
}): Record<BaseCampAnchorKey, BaseCampAnchorState> {
  const { event, policy } = args;

  if (!policy?.canAccessBaseCamp) {
    return Object.fromEntries(
      ANCHOR_KEYS.map((k) => [k, "done" as BaseCampAnchorState])
    ) as Record<BaseCampAnchorKey, BaseCampAnchorState>;
  }

  const state = event.state;
  const rosterLocked = event.instruments.roster?.status === "done";
  const flightsPlanDone = event.instruments.flights_plan?.status === "done";
  const travelDocsRequired = event.requirements?.travelDocsRequired ?? false;
  const complianceMissing =
    (event.compliance?.missingDocsIds?.length ?? 0) > 0;

  // Roster: blocked when signups_open (roster is the active gate); done once locked
  const roster: BaseCampAnchorState =
    state === "signups_open" ? "blocked" : state === "forming" ? "floating" : "done";

  // Booking: v1 no booking blocker in code; floating
  const booking: BaseCampAnchorState = "floating";

  // Compliance: done if not required; if required, blocked when missing > 0 (when event.compliance available)
  let compliance: BaseCampAnchorState;
  if (!travelDocsRequired) {
    compliance = "done";
  } else if (event.compliance !== undefined) {
    compliance = complianceMissing ? "blocked" : "done";
  } else {
    compliance = "floating";
  }

  // Tee groups: blocked when (locked or gameday) and flights_plan not done; done when done; else floating
  let tee_groups: BaseCampAnchorState;
  if (state === "locked" || state === "gameday") {
    tee_groups = flightsPlanDone ? "done" : "blocked";
  } else if (state === "in_play" || state === "completed") {
    tee_groups = "done";
  } else {
    tee_groups = "floating";
  }

  // GameDay: blocked when state === "gameday" (entry is next required action); done otherwise when past
  const gameday: BaseCampAnchorState =
    state === "gameday" ? "blocked" : state === "in_play" || state === "completed" ? "done" : "floating";

  return {
    roster,
    booking,
    compliance,
    tee_groups,
    gameday,
  };
}

/**
 * Compute the anchor band summary line.
 * Answers: "What's the overall situation?"
 */
export function computeBaseCampAnchorSummary(args: {
  anchorStates: Record<BaseCampAnchorKey, BaseCampAnchorState>;
  primaryInstrument: BaseCampPrimaryInstrument;
}): string {
  const { anchorStates, primaryInstrument } = args;

  if (primaryInstrument !== null) {
    switch (primaryInstrument) {
      case "roster": return "Waiting on the roster.";
      case "compliance": return "Blocked by compliance.";
      case "tee_groups": return "Blocked by tee groups.";
      case "gameday": return "GameDay is next.";
      case "booking":
      default: return "Waiting.";
    }
  }

  const hasFloating = (ANCHOR_KEYS as BaseCampAnchorKey[]).some((k) => anchorStates[k] === "floating");
  return hasFloating ? "All good for now. Some details are waiting." : "All set.";
}

/**
 * Compute the "What's happening next" narration line for BaseCamp.
 * Non-interactive; clarifies sign-ups status and current blocker context.
 * Not an instrument; must not compete with primary instrument.
 * Roster count is always included when capacity/confirmed are available.
 */
export function computeBaseCampNextLine(args: {
  event: EventContext;
  anchorStates: Record<BaseCampAnchorKey, BaseCampAnchorState>;
  primaryInstrument: BaseCampPrimaryInstrument;
  missingComplianceNames?: string[];
}): string | null {
  const { event, anchorStates, primaryInstrument, missingComplianceNames } = args;

  const capacity = event.instruments.capacity?.data?.capacityLimit ?? null;
  const confirmed = event.instruments.roster?.data?.confirmedCount ?? 0;
  const hasRosterCount = capacity != null && capacity > 0;
  const rosterCount = hasRosterCount ? ` ${confirmed} of ${capacity} confirmed.` : "";

  const signupsOpen = event.state === "signups_open";

  let sentence = "";

  if (primaryInstrument === null) {
    sentence = hasRosterCount ? rosterCount.trim() : "";
  } else if (signupsOpen) {
    sentence = hasRosterCount
      ? `Sign-ups are open.${rosterCount}`
      : "Sign-ups are open.";
    if (primaryInstrument === "roster") {
      sentence += " Waiting to see who's in.";
    }
  } else {
    sentence = hasRosterCount
      ? `Sign-ups are closed.${rosterCount}`
      : "Sign-ups are closed.";
    if (primaryInstrument === "compliance") {
      const firstName = missingComplianceNames?.[0];
      sentence += firstName
        ? ` Waiting on ${firstName} to add passport details.`
        : " Waiting on one member to add passport details.";
    } else if (primaryInstrument === "tee_groups") {
      sentence += " Tee groups need to be set before GameDay.";
    } else if (primaryInstrument === "gameday") {
      sentence += " GameDay is ready to open.";
    }
  }

  return sentence.trim() || null;
}

/**
 * Select at most one primary instrument to show.
 * Priority: roster → compliance → tee_groups → gameday; else null.
 * Do not select booking unless a real booking blocker exists in code (v1: never).
 */
export function selectBaseCampPrimaryInstrument(args: {
  event: EventContext;
  policy: EventPolicy | null;
}): BaseCampPrimaryInstrument {
  const { event, policy } = args;

  if (!policy?.canAccessBaseCamp) {
    return null;
  }

  const anchors = computeBaseCampAnchorStates({ event, policy });

  if (anchors.roster === "blocked") return "roster";
  if (anchors.compliance === "blocked") return "compliance";
  if (anchors.tee_groups === "blocked") return "tee_groups";
  if (anchors.gameday === "blocked") return "gameday";

  return null;
}
