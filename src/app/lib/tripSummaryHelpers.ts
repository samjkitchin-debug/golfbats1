/**
 * Trip Summary Helpers
 * 
 * Generate human-readable, plain English summaries from trip configuration.
 * Used in trip creation flow and confirmation screens.
 */

import type { TripRecipe } from "./tripIntent";
import type { ScenarioAnswers } from "./tripScenario";

/**
 * Generate human-readable summary from recipe and answers
 */
export function generateHumanSummary(
  recipe: TripRecipe,
  answers: ScenarioAnswers,
  tripDate?: string,
  cutoffRule?: "nightBefore" | "daysBefore" | "none",
  cutoffDays?: number | null,
  capacity?: number | null
): string[] {
  const summary: string[] = [];

  // Signups
  if (recipe.sections.signups) {
    if (cutoffRule === "nightBefore") {
      summary.push("People can join until the night before");
    } else if (cutoffRule === "daysBefore" && cutoffDays) {
      summary.push(`People can join until ${cutoffDays} day${cutoffDays !== 1 ? 's' : ''} before`);
    } else if (cutoffRule === "none") {
      // No cutoff set yet
    } else {
      summary.push("People can join until signups close");
    }
  }

  // Booking responsibility
  if (answers.bookingResponsibility === "organiser") {
    summary.push("You'll organise bookings once signups close");
  } else if (answers.bookingResponsibility === "agent") {
    summary.push("An external organiser will handle bookings once signups close");
  } else {
    summary.push("Everyone sorts themselves");
  }

  // Required member info
  if (answers.requiredMemberInfo && answers.requiredMemberInfo.length > 0) {
    const hasHandicap = answers.requiredMemberInfo.includes("handicap");
    const hasPassport = answers.requiredMemberInfo.some(f => f.includes("passport"));
    
    if (hasPassport && hasHandicap) {
      summary.push("You'll collect handicaps and travel or ID details");
    } else if (hasHandicap) {
      summary.push("You'll collect handicaps");
    } else if (hasPassport) {
      summary.push("You'll collect travel or ID details");
    }
  }

  // Travel coordination
  if (answers.travelCoordination) {
    summary.push("You'll organise how everyone gets there");
  } else {
    summary.push("Everyone will sort their own travel");
  }

  // Capacity
  if (capacity && capacity > 0) {
    summary.push(`Limited to ${capacity} spot${capacity !== 1 ? 's' : ''}`);
  }

  return summary;
}
