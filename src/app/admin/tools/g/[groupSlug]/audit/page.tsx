import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../../lib/supabaseServer";
import { isEmailAdmin } from "../../../../../lib/auth";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/admin/tools/g/${encodeURIComponent(groupSlug)}/audit`);
  }

  // Verify group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slug")
    .eq("slug", groupSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!group) {
    redirect("/admin/tools?error=group_not_found");
  }

  // Platform admin: only via isEmailAdmin
  const isPlatformAdmin = isEmailAdmin(user.email);

  // Authorization: Check if user is APPROVED admin for this group OR platform admin
  const { data: groupMember } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isGroupAdmin =
    isPlatformAdmin ||
    (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

  if (!isGroupAdmin) {
    redirect("/admin/tools?error=not_authorized");
  }

  // Try to query trip_events if table exists
  let events: any[] = [];
  let hasEventsTable = false;

  try {
    const { data: eventsData, error: eventsError } = await supabase
      .from("trip_events")
      .select("event_type, created_at, scenario_key")
      .eq("group_id", group.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!eventsError && eventsData) {
      events = eventsData;
      hasEventsTable = true;
    }
  } catch {
    // Table doesn't exist or query failed
    hasEventsTable = false;
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Audit</h1>
      <p className="text-sm text-secondary mb-6">Recent events for this group</p>

      {!hasEventsTable ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center">
          <p className="text-sm text-secondary">No audit events available yet.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center">
          <p className="text-sm text-secondary">No events found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {event.event_type || "—"}
                  </div>
                  {event.scenario_key && (
                    <div className="text-xs text-secondary mt-0.5">
                      Scenario: {event.scenario_key}
                    </div>
                  )}
                </div>
                <div className="text-xs text-secondary whitespace-nowrap">
                  {formatDate(event.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
