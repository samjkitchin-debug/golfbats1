/**
 * Phase Copy Helper
 * 
 * Centralized copy/text for BaseCamp phase status lines.
 * Ensures consistent language across UI components.
 */

import { BaseCampPhase } from "./phaseDefinitions";

export function getPhaseStatusLine(phase: BaseCampPhase, ctx?: {
  opensAtText?: string;
  closesAtText?: string;
}) {
  switch (phase) {
    case "forming":
      return ctx?.opensAtText
        ? `Sign-ups open on ${ctx.opensAtText}.`
        : "Trip is forming.";

    case "signups_open":
      return "Sign-ups are open now.";

    case "locked":
      return null;

    case "gameday":
      return "Today's the day.";

    case "in_play":
      return "In progress.";

    case "completed":
      return "Completed.";

    default:
      return "";
  }
}
