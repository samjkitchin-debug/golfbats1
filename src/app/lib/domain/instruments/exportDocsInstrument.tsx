"use client";

import { useState, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import type { Attendee } from "../../tripActions";

/**
 * Export Docs Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function ExportDocsBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
  saveTripPatch,
}: InstrumentRenderProps) {
  const exportDocsData = event.instruments.export_docs.data;
  const isDone = event.instruments.export_docs.status === "done";
  
  const [showSelection, setShowSelection] = useState(!isDone);
  const [showTravelAgentPreview, setShowTravelAgentPreview] = useState(false);
  const [showGolfCoursePreview, setShowGolfCoursePreview] = useState(false);
  const [attendeeProfiles, setAttendeeProfiles] = useState<Array<{
    memberId: string;
    name: string;
    nationality: string | null;
    passportFullName: string | null;
    passportNumber: string | null;
    passportNationality: string | null;
    passportDateOfBirth: string | null;
    passportExpiryDate: string | null;
  }>>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Load attendee profiles when preview is opened
  useEffect(() => {
    if ((showTravelAgentPreview || showGolfCoursePreview) && attendeeProfiles.length === 0 && !loadingProfiles) {
      loadAttendeeProfiles();
    }
  }, [showTravelAgentPreview, showGolfCoursePreview]);

  async function loadAttendeeProfiles() {
    if (!supabase || loadingProfiles) return;
    
    setLoadingProfiles(true);
    try {
      const confirmed = event.trip.attendees.filter((a) => a.status === "confirmed");
      const memberIds = confirmed.filter((a) => a.memberId).map((a) => a.memberId!);
      
      if (memberIds.length === 0) {
        setAttendeeProfiles([]);
        setLoadingProfiles(false);
        return;
      }

      // Load member data (nationality, profile photo)
      const { data: membersData } = await supabase
        .from("members")
        .select("id, nationality, profile_photo_path")
        .in("id", memberIds);

      // Passport data is now canonical in member_passports and accessed via secure export endpoint
      // For preview, use derived compliance fields from attendee (docsComplete, missingDocsFields)
      // Actual export should use /api/trips/[id]/passport/export (secure, audited, decrypts numbers)
      const profiles = confirmed.map((attendee) => {
        const member = membersData?.find((m: any) => m.id === attendee.memberId);
        
        // Use derived compliance fields - actual passport values are only available via secure export endpoint
        const hasPassportData = attendee.docsComplete === true;
        
        return {
          memberId: attendee.memberId || "",
          name: attendee.name,
          nationality: member?.nationality || null,
          // Preview shows completeness only - actual values require secure export endpoint
          passportFullName: hasPassportData ? "[Complete]" : null,
          passportNumber: hasPassportData ? "[Complete]" : null,
          passportNationality: hasPassportData ? "[Complete]" : null, // Note: canonical field is passport_country
          passportDateOfBirth: null, // Not stored in v1 schema
          passportExpiryDate: hasPassportData ? "[Complete]" : null,
        };
      });

      setAttendeeProfiles(profiles);
    } catch (error) {
      console.error("Failed to load attendee profiles:", error);
    } finally {
      setLoadingProfiles(false);
    }
  }

  async function handleOpenTravelAgent() {
    setShowTravelAgentPreview(true);
    if (!isDone) {
      // Set exportDocsConfirmed flag when preview is opened for the first time
      try {
        const result = await saveTripPatch({
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            exportDocsConfirmed: true,
          },
        });

        if (!result.ok) {
          console.error("Failed to mark export docs complete:", result.error);
        }
        // saveTripPatch already updated local state
      } catch (error) {
        console.error("Failed to mark export docs complete:", error);
      }
    }
  }

  async function handleOpenGolfCourse() {
    setShowGolfCoursePreview(true);
    if (!isDone) {
      // Set exportDocsConfirmed flag when preview is opened for the first time
      try {
        const result = await saveTripPatch({
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            exportDocsConfirmed: true,
          },
        });

        if (!result.ok) {
          console.error("Failed to mark export docs complete:", result.error);
        }
        // saveTripPatch already updated local state
      } catch (error) {
        console.error("Failed to mark export docs complete:", error);
      }
    }
  }

  function copyTravelAgentAsText() {
    const confirmed = event.trip.attendees.filter((a) => a.status === "confirmed");
    const completeCount = attendeeProfiles.filter((p) => 
      p.passportFullName && p.passportNumber && p.passportNationality && p.passportDateOfBirth && p.passportExpiryDate
    ).length;
    
    let text = `TRAVEL AGENT DOCUMENT\n`;
    text += `Trip: ${event.trip.tripName || event.trip.name || "Trip"}\n`;
    text += `Date: ${event.trip.date}\n`;
    text += `\nCompleteness: ${completeCount} / ${confirmed.length} profiles complete\n\n`;
    text += `ATTENDEES:\n`;
    text += `---\n\n`;
    
    attendeeProfiles.forEach((profile) => {
      text += `Name: ${profile.name}\n`;
      text += `Nationality: ${profile.nationality || "Not set"}\n`;
      text += `Passport Name: ${profile.passportFullName || "Not set"}\n`;
      text += `Passport Number: ${profile.passportNumber || "Not set"}\n`;
      text += `Passport Nationality: ${profile.passportNationality || "Not set"}\n`;
      text += `Date of Birth: ${profile.passportDateOfBirth || "Not set"}\n`;
      text += `Passport Expiry: ${profile.passportExpiryDate || "Not set"}\n`;
      text += `\n---\n\n`;
    });

    navigator.clipboard.writeText(text).catch(console.error);
  }

  function copyGolfCourseAsText() {
    const confirmed = event.trip.attendees.filter((a) => a.status === "confirmed");
    const meetTime = event.instruments.meet_details.data.meetTime;
    const meetingPoint = event.instruments.meet_details.data.meetingPoint;
    const logistics = event.trip.logistics;
    
    let text = `GOLF COURSE DOCUMENT\n`;
    text += `Trip: ${event.trip.tripName || event.trip.name || "Trip"}\n`;
    text += `Date: ${event.trip.date}\n`;
    text += `\nATTENDEES (${confirmed.length}):\n`;
    confirmed.forEach((attendee) => {
      text += `- ${attendee.name}\n`;
    });
    
    // Note: Flights/foursomes would come from flights_plan snapshot, but for now just list attendees
    text += `\nFLIGHTS / FOURSOMES:\n`;
    text += `(To be populated from flights plan)\n`;
    
    if (meetTime || meetingPoint) {
      text += `\nMEET DETAILS:\n`;
      if (meetTime) text += `Time: ${meetTime}\n`;
      if (meetingPoint) text += `Location: ${meetingPoint}\n`;
    }
    
    if (logistics?.itineraryDetails || event.trip.travelType) {
      text += `\nTRANSPORT:\n`;
      if (event.trip.travelType) {
        text += `Type: ${event.trip.travelType}\n`;
      }
      if (logistics?.itineraryDetails) {
        text += `Details: ${logistics.itineraryDetails}\n`;
      }
    }

    navigator.clipboard.writeText(text).catch(console.error);
  }

  // Done state: show compact view with Change link
  if (isDone && !showSelection && !showTravelAgentPreview && !showGolfCoursePreview) {
    return (
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Export docs: prepared</div>
        <button
          type="button"
          onClick={() => {
            setShowSelection(true);
          }}
          className="text-xs text-muted-foreground hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  // TODO state: show two action buttons
  if (showSelection || !isDone) {
    return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={handleOpenTravelAgent}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/20 text-left"
        >
          Travel agent document
        </button>
        <button
          type="button"
          onClick={handleOpenGolfCourse}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/20 text-left"
        >
          Golf course document
        </button>
      </div>

      {/* Travel Agent Preview Modal */}
      {showTravelAgentPreview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Travel agent document</h3>
              <button
                type="button"
                onClick={() => {
                  setShowTravelAgentPreview(false);
                  if (isDone) {
                    setShowSelection(false);
                  }
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingProfiles ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-foreground">
                  <strong>Completeness:</strong> {attendeeProfiles.filter((p) => 
                    p.passportFullName && p.passportNumber && p.passportNationality && p.passportDateOfBirth && p.passportExpiryDate
                  ).length} / {attendeeProfiles.length} profiles complete
                </div>

                <div className="space-y-4">
                  {attendeeProfiles.map((profile) => {
                    const isComplete = Boolean(
                      profile.passportFullName && profile.passportNumber && profile.passportNationality && 
                      profile.passportDateOfBirth && profile.passportExpiryDate
                    );
                    
                    return (
                      <div key={profile.memberId} className="border border-border rounded-lg p-4 space-y-2">
                        <div className="font-medium text-foreground">{profile.name}</div>
                        <div className="text-sm space-y-1">
                          <div><span className="text-muted">Nationality:</span> {profile.nationality || "Not set"}</div>
                          <div><span className="text-muted">Passport Name:</span> {profile.passportFullName || "Not set"}</div>
                          <div><span className="text-muted">Passport Number:</span> {profile.passportNumber || "Not set"}</div>
                          <div><span className="text-muted">Passport Nationality:</span> {profile.passportNationality || "Not set"}</div>
                          <div><span className="text-muted">Date of Birth:</span> {profile.passportDateOfBirth || "Not set"}</div>
                          <div><span className="text-muted">Passport Expiry:</span> {profile.passportExpiryDate || "Not set"}</div>
                        </div>
                        {!isComplete && (
                          <div className="text-xs text-muted">Profile incomplete</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={copyTravelAgentAsText}
                  className="w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                >
                  Copy as text
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Golf Course Preview Modal */}
      {showGolfCoursePreview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Golf course document</h3>
              <button
                type="button"
                onClick={() => {
                  setShowGolfCoursePreview(false);
                  if (isDone) {
                    setShowSelection(false);
                  }
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="font-medium text-foreground mb-2">Attendees</div>
                <div className="text-sm space-y-1">
                  {event.trip.attendees.filter((a) => a.status === "confirmed").map((attendee) => (
                    <div key={attendee.name}>{attendee.name}</div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-medium text-foreground mb-2">Flights / Foursomes</div>
                <div className="text-sm text-muted">(To be populated from flights plan)</div>
              </div>

              {(event.trip.logistics?.itineraryDetails || event.trip.travelType) && (
                <div>
                  <div className="font-medium text-foreground mb-2">Transport details</div>
                  <div className="text-sm space-y-1">
                    {event.trip.travelType && (
                      <div><span className="text-muted">Type:</span> {event.trip.travelType}</div>
                    )}
                    {event.trip.logistics?.itineraryDetails && (
                      <div><span className="text-muted">Details:</span> {event.trip.logistics.itineraryDetails}</div>
                    )}
                  </div>
                </div>
              )}

              {(event.instruments.meet_details.data.meetTime || event.instruments.meet_details.data.meetingPoint) && (
                <div>
                  <div className="font-medium text-foreground mb-2">Meet details</div>
                  <div className="text-sm space-y-1">
                    {event.instruments.meet_details.data.meetTime && (
                      <div><span className="text-muted">Time:</span> {event.instruments.meet_details.data.meetTime}</div>
                    )}
                    {event.instruments.meet_details.data.meetingPoint && (
                      <div><span className="text-muted">Location:</span> {event.instruments.meet_details.data.meetingPoint}</div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={copyGolfCourseAsText}
                className="w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
              >
                Copy as text
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }

  // If modals are open, render them (handled above in the return statement)
  return <></>;
}
