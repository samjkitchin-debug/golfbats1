"use client";

import { useState } from "react";
import Link from "next/link";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { publishTripResult, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Results Publish Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function ResultsPublishBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const resultsData = event.instruments.results_publish.data;
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  async function handlePublish() {
    if (publishing || !currentUserId || !activeGroupId) return;

    setPublishing(true);
    setPublished(false);

    try {
      // Use existing trip.result data if available, otherwise empty leaderboard
      const existingResult = event.trip.result;
      const payload = existingResult
        ? {
            leaderboard: existingResult.leaderboard || [],
            notes: existingResult.notes,
          }
        : {
            leaderboard: [],
            notes: undefined,
          };

      // Publish results using existing API
      const updatedTrips = await publishTripResult(
        [event.trip],
        event.trip.id,
        activeGroupId,
        payload
      );

      // Update local trip state
      const updatedTrip = updatedTrips.find((t) => t.id === event.trip.id);
      if (updatedTrip) {
        onTripUpdate(updatedTrip);
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const freshTrip = freshTrips.find((t) => t.id === event.trip.id);

      if (freshTrip) {
        onTripUpdate(freshTrip);
      }

      setPublished(true);
      
      // Clear published state after 2 seconds
      setTimeout(() => setPublished(false), 2000);
    } catch (error) {
      console.error("Failed to publish results:", error);
      alert(
        `Failed to publish results: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setPublishing(false);
    }
  }

  // If can't view results and no results exist, show muted message
  if (!policy.canViewResults && !resultsData.hasResults) {
    return (
      <div className="text-sm text-muted">Results will appear here once the round begins.</div>
    );
  }

  // If published, show published status and view button
  if (resultsData.isPublished) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-foreground">
          {resultsData.publishedAtText
            ? `Results published ${resultsData.publishedAtText}.`
            : "Results published."}
        </div>
        <Link
          href={`/results/${event.trip.id}`}
          className="inline-block rounded-xl border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
        >
          View results →
        </Link>
      </div>
    );
  }

  // If in_play and not published, show publish button (host only)
  if (event.state === "in_play" && !resultsData.isPublished) {
    if (policy.canPublishResults) {
      return (
        <div className="space-y-3">
          <div className="text-sm text-muted">Make results visible to everyone.</div>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? "Publishing..." : published ? "Published" : "Publish results"}
          </button>
        </div>
      );
    }
  }

  // If results exist but not published and user is not host
  if (resultsData.hasResults && !resultsData.isPublished && !policy.canPublishResults) {
    return (
      <div className="text-sm text-muted">Results pending publish.</div>
    );
  }

  // Default: show nothing or muted message
  return (
    <div className="text-sm text-muted">Results will appear here once the round begins.</div>
  );
}
