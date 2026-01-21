/**
 * Phase Display Mapping
 * 
 * Centralized mapping for BaseCamp phase labels and status lines.
 * Ensures consistent terminology across all UI surfaces.
 */

import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";
import type { EventContext } from "./eventTypes";

export type PhaseDisplayContext = {
  opensAtText?: string; // e.g. "Sat 12 Jan"
  closesAtText?: string; // e.g. "Fri 13 Jan"
  tripDate?: string; // YYYY-MM-DD
  tripDateText?: string; // e.g. "Sat 12 Jan"
};

/**
 * Get canonical phase label (no punctuation)
 */
export function getPhaseLabel(state: BaseCampPhase): string {
  switch (state) {
    case "forming":
      return "Forming";
    case "signups_open":
      return "Sign-ups open";
    case "locked":
      return "Sign-ups closed";
    case "gameday":
      return "GameDay";
    case "in_play":
      return "In play";
    case "completed":
      return "Completed";
    default:
      return "";
  }
}

/**
 * Get status line variant (user-facing narrative, with period)
 */
export function getPhaseStatusLine(state: BaseCampPhase, ctx?: PhaseDisplayContext): string | null {
  switch (state) {
    case "forming":
      return ctx?.opensAtText ? `Sign-ups open on ${ctx.opensAtText}.` : null;
    case "signups_open":
      return ctx?.closesAtText ? `Sign-ups close on ${ctx.closesAtText}.` : null;
    case "locked":
      return ctx?.tripDateText ? `GameDay unlocks on ${ctx.tripDateText}.` : null;
    case "gameday":
      return "Round day — scoring opens now.";
    case "in_play":
      return "Scoring is live.";
    case "completed":
      return "Results are published.";
    default:
      return null;
  }
}

/**
 * Get next phase and preview information
 * Returns preview narrative for the NEXT phase transition, not the next state's default status line
 */
export function getNextPhasePreview(
  currentState: BaseCampPhase,
  ctx?: PhaseDisplayContext
): { label: string; line: string; at?: string } | null {
  // Determine next state from lifecycle order
  const nextState: BaseCampPhase | null = (() => {
    switch (currentState) {
      case "forming":
        return "signups_open";
      case "signups_open":
        return "locked";
      case "locked":
        return "gameday";
      case "gameday":
        return "in_play";
      case "in_play":
        return "completed";
      case "completed":
        return null;
      default:
        return null;
    }
  })();

  if (!nextState) return null;

  const nextLabel = getPhaseLabel(nextState);
  
  // Preview line shows what happens when entering the next phase, not the next phase's default status
  // For example: from "forming" → "signups_open", preview should be "Sign-ups open on {date}"
  // NOT "Sign-ups close on {date}" (which is the status line when already IN signups_open)
  let nextPreviewLine: string | null = null;
  switch (currentState) {
    case "forming":
      // When transitioning from forming to signups_open, preview the opening
      nextPreviewLine = ctx?.opensAtText ? `Sign-ups open on ${ctx.opensAtText}.` : null;
      break;
    case "signups_open":
      // When transitioning from signups_open to locked, preview the closing
      nextPreviewLine = ctx?.closesAtText ? `Sign-ups close on ${ctx.closesAtText}.` : null;
      break;
    case "locked":
      // When transitioning from locked to gameday, preview GameDay unlocking
      nextPreviewLine = ctx?.tripDateText ? `GameDay unlocks on ${ctx.tripDateText}.` : null;
      break;
    case "gameday":
      // When transitioning from gameday to in_play, preview scoring starting
      nextPreviewLine = "Scoring is live.";
      break;
    case "in_play":
      // When transitioning from in_play to completed, preview results publishing
      nextPreviewLine = "Results are published.";
      break;
    default:
      nextPreviewLine = null;
  }

  if (!nextPreviewLine) return null;

  return {
    label: nextLabel,
    line: nextPreviewLine,
    at: ctx?.opensAtText || ctx?.closesAtText || ctx?.tripDateText,
  };
}

/**
 * Format date for anchor display (e.g. "Thu 25 Feb")
 */
export function formatDateForAnchor(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
  const dayNum = dateObj.getUTCDate();
  const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
  return `${dayName} ${dayNum} ${mon}`;
}
