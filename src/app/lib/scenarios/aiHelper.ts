/**
 * AI Helper for Scenario Selection
 * 
 * Proposes ScenarioAnswers from free-form text description.
 * For now, uses simple keyword-based rules. Can be replaced with
 * actual AI/LLM integration later.
 * 
 * IMPORTANT: This never directly writes scenario_key. It only proposes
 * answers; the deterministic classifier (deriveScenarioKey) then derives ScenarioKey.
 */

import { type ScenarioAnswers } from "./classifier";

export type ScenarioProposal = {
  answers: ScenarioAnswers;
  confidence: number; // 0.0 to 1.0
  followupQuestion?: string; // Optional question to resolve ambiguity
};

/**
 * Propose ScenarioAnswers from free-form text description.
 * 
 * Uses keyword-based rules for now. Returns confidence score and
 * optional followup question if confidence is low.
 */
export function proposeScenarioAnswersFromText(text: string): ScenarioProposal {
  const lowerText = text.toLowerCase().trim();
  
  if (!lowerText) {
    // Empty text - return neutral defaults
    return {
      answers: {
        organiserBooking: false,
        travelCoordination: false,
        crossBorderAgent: false,
      },
      confidence: 0.0,
      followupQuestion: "What kind of day is this?",
    };
  }

  // Initialize answers
  const answers: ScenarioAnswers = {
    organiserBooking: false,
    travelCoordination: false,
    crossBorderAgent: false,
  };

  let confidence = 0.0;
  let followupQuestion: string | undefined;

  // Check for cross-border agent keywords (high priority)
  const crossBorderKeywords = [
    "passport", "ferry", "agent", "batam", "malaysia", "cross border",
    "border", "international", "overseas", "visa", "immigration",
  ];
  const hasCrossBorderSignals = crossBorderKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );
  
  if (hasCrossBorderSignals) {
    answers.crossBorderAgent = true;
    confidence = 0.9;
    // crossBorderAgent takes priority, no need for other signals
    return { answers, confidence };
  }

  // Check for organiser booking keywords
  const organiserKeywords = [
    "i'm booking", "i'll book", "i am booking", "i will book",
    "need a roster", "need roster", "booking for", "book for",
    "organiser", "organizer", "coordinator", "arranging",
  ];
  const hasOrganiserSignals = organiserKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );
  
  if (hasOrganiserSignals) {
    answers.organiserBooking = true;
    confidence = 0.85;
    return { answers, confidence };
  }

  // Check for travel coordination keywords
  const travelKeywords = [
    "travelling", "traveling", "travel together", "meet at",
    "pickup", "pick up", "carpool", "car pool", "drive together",
    "share ride", "shared transport", "transport", "coordinate",
  ];
  const hasTravelSignals = travelKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );

  // Check for overnight keywords (only relevant if travelling)
  const overnightKeywords = [
    "overnight", "stay", "hotel", "accommodation", "night",
    "multi day", "multi-day", "2 days", "two days", "weekend trip",
  ];
  const hasOvernightSignals = overnightKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );

  // Check for carpool keywords (refinement of travel)
  const carpoolKeywords = [
    "carpool", "car pool", "pickup", "pick up", "pick-up",
    "drive together", "shared car", "car share",
  ];
  const hasCarpoolSignals = carpoolKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );

  if (hasTravelSignals) {
    answers.travelCoordination = true;
    
    if (hasOvernightSignals) {
      answers.overnight = true;
      confidence = 0.85;
      return { answers, confidence };
    }
    
    if (hasCarpoolSignals) {
      answers.carpool = true;
      confidence = 0.8;
      return { answers, confidence };
    }
    
    // Just travel, but need to clarify overnight vs day trip
    confidence = 0.6;
    followupQuestion = "Is this an overnight trip or a day trip?";
    return { answers, confidence, followupQuestion };
  }

  // Check for local round keywords (meet at course)
  const localKeywords = [
    "local", "home course", "regular", "usual", "standard",
    "meet at course", "at the course", "course only",
  ];
  const hasLocalSignals = localKeywords.some((keyword) =>
    lowerText.includes(keyword)
  );

  if (hasLocalSignals) {
    // Default to local_round (no travel coordination)
    confidence = 0.7;
    return { answers, confidence };
  }

  // Low confidence - return neutral defaults with followup
  confidence = 0.3;
  followupQuestion = "Will you be travelling together, or meeting at the course?";
  return { answers, confidence, followupQuestion };
}
