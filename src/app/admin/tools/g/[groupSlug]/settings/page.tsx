"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../../lib/supabaseBrowser";

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  visibility: string | null;
  base_country: string | null;
  base_city: string | null;
  slug: string;
};

export default function GroupSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const groupSlug = params.groupSlug as string;

  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    visibility: "",
    base_country: "",
    base_city: "",
  });

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [deleteConfirmCheckbox, setDeleteConfirmCheckbox] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadGroup() {
      const supabase = createSupabaseBrowserClient();
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("id, name, description, visibility, base_country, base_city, slug")
        .eq("slug", groupSlug)
        .eq("is_active", true)
        .maybeSingle();

      if (groupError || !groupData) {
        setError("Group not found");
        setLoading(false);
        return;
      }

      setGroup(groupData);
      setFormData({
        name: groupData.name || "",
        description: groupData.description || "",
        visibility: groupData.visibility || "",
        base_country: groupData.base_country || "",
        base_city: groupData.base_city || "",
      });
      setLoading(false);
    }

    loadGroup();
  }, [groupSlug]);

  async function handleSave() {
    if (!group) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("groups")
      .update({
        name: formData.name,
        description: formData.description || null,
        visibility: formData.visibility || null,
        base_country: formData.base_country || null,
        base_city: formData.base_city || null,
      })
      .eq("id", group.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!group) return;

    if (deleteConfirmSlug !== group.slug || !deleteConfirmCheckbox) {
      setError("Please confirm deletion by typing the group slug and checking the box");
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/admin/tools/g/${groupSlug}/settings/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmText: deleteConfirmSlug,
          expectedSlug: group.slug,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to delete group");
        setDeleting(false);
        return;
      }

      router.push("/admin/tools");
    } catch (err) {
      setError("Failed to delete group");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Group settings</h1>
        <p className="text-sm text-secondary">Loading...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Group settings</h1>
        <p className="text-sm text-secondary">Group not found</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Group settings</h1>
      <p className="text-sm text-secondary mb-6">Configure group details</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Settings saved
        </div>
      )}

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Visibility</label>
          <input
            type="text"
            value={formData.visibility}
            onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Base country</label>
          <input
            type="text"
            value={formData.base_country}
            onChange={(e) => setFormData({ ...formData, base_country: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Base city</label>
          <input
            type="text"
            value={formData.base_city}
            onChange={(e) => setFormData({ ...formData, base_city: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg btn-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      <div className="pt-8 border-t border-border">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground mb-2">Danger zone</h2>
          <p className="text-sm text-secondary mb-4">
            Deleting a group is irreversible. All trips, members, and data associated with this
            group will be permanently removed.
          </p>
        </div>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 transition-colors"
          >
            Delete group
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Type the group slug to confirm: <span className="font-mono">{group.slug}</span>
              </label>
              <input
                type="text"
                value={deleteConfirmSlug}
                onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder={group.slug}
              />
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={deleteConfirmCheckbox}
                onChange={(e) => setDeleteConfirmCheckbox(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                I understand this cannot be undone.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDelete(false);
                  setDeleteConfirmSlug("");
                  setDeleteConfirmCheckbox(false);
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmSlug !== group.slug || !deleteConfirmCheckbox}
                className="flex-1 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete group"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
