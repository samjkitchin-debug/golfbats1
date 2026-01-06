"use client";

import { useEffect, useState } from "react";

type DevNote = {
  id: string;
  title: string;
  content: string;
  type: "bug" | "note";
  createdAt: string;
  resolved?: boolean;
};

type DbNote = {
  id: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export default function DevNotesPage() {
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"bug" | "note">("bug");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse JSON note from database into DevNote structure
  function parseDbNote(dbNote: DbNote): DevNote | null {
    try {
      const parsed = JSON.parse(dbNote.note);
      return {
        id: dbNote.id,
        title: parsed.title || "",
        content: parsed.content || "",
        type: parsed.type || "note",
        createdAt: dbNote.created_at,
        resolved: parsed.resolved || false,
      };
    } catch {
      // Legacy format: if note is plain text, convert it
      return {
        id: dbNote.id,
        title: "Note",
        content: dbNote.note,
        type: "note" as const,
        createdAt: dbNote.created_at,
        resolved: false,
      };
    }
  }

  // Convert DevNote to JSON string for database
  function serializeNote(note: Omit<DevNote, "id" | "createdAt">): string {
    return JSON.stringify({
      title: note.title,
      content: note.content,
      type: note.type,
      resolved: note.resolved || false,
    });
  }

  async function loadNotes() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-notes");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load notes.");
      }

      const dbNotes: DbNote[] = json.notes || [];
      const parsedNotes = dbNotes.map(parseDbNote).filter((n): n is DevNote => n !== null);
      setNotes(parsedNotes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
  }, []);

  async function handleAdd() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) return;

    setError(null);
    try {
      const noteText = serializeNote({
        title: trimmedTitle,
        content: trimmedContent,
        type,
        resolved: false,
      });

      const res = await fetch("/api/dev-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: noteText }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save note.");
      }

      // Reload notes from server
      await loadNotes();
      setTitle("");
      setContent("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save note.");
    }
  }

  async function handleUpdate(id: string) {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) return;

    setError(null);
    try {
      const existingNote = notes.find((n) => n.id === id);
      if (!existingNote) return;

      const noteText = serializeNote({
        title: trimmedTitle,
        content: trimmedContent,
        type,
        resolved: existingNote.resolved || false,
      });

      const res = await fetch("/api/dev-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: noteText, id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to update note.");
      }

      // Reload notes from server
      await loadNotes();
      setTitle("");
      setContent("");
      setEditingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update note.");
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Delete this note?");
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch("/api/dev-notes", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to delete note.");
      }

      // Reload notes from server
      await loadNotes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete note.");
    }
  }

  async function handleToggleResolved(id: string) {
    setError(null);
    try {
      const existingNote = notes.find((n) => n.id === id);
      if (!existingNote) return;

      const noteText = serializeNote({
        title: existingNote.title,
        content: existingNote.content,
        type: existingNote.type,
        resolved: !existingNote.resolved,
      });

      const res = await fetch("/api/dev-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: noteText, id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to update note.");
      }

      // Reload notes from server
      await loadNotes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update note.");
    }
  }

  function startEdit(note: DevNote) {
    setTitle(note.title);
    setContent(note.content);
    setType(note.type);
    setEditingId(note.id);
  }

  function cancelEdit() {
    setTitle("");
    setContent("");
    setType("bug");
    setEditingId(null);
  }

  const sorted = [...notes].sort((a, b) => {
    // Unresolved first, then by date (newest first)
    if (a.resolved !== b.resolved) {
      return a.resolved ? 1 : -1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const unresolvedBugs = notes.filter((n) => !n.resolved && n.type === "bug").length;
  const unresolvedNotes = notes.filter((n) => !n.resolved && n.type === "note").length;
  const unresolvedCount = unresolvedBugs + unresolvedNotes;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold text-brand-black">Dev Notes</div>
        <div className="mt-1 text-sm text-gray-600">
          Track bugs and notes while testing. {unresolvedCount > 0 && (
            <span className="font-medium">
              {unresolvedBugs > 0 && `${unresolvedBugs} bug${unresolvedBugs !== 1 ? "s" : ""}`}
              {unresolvedBugs > 0 && unresolvedNotes > 0 && ", "}
              {unresolvedNotes > 0 && `${unresolvedNotes} note${unresolvedNotes !== 1 ? "s" : ""}`}
              {" unresolved"}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
          Loading notes...
        </div>
      )}

      {/* Add/Edit Form */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-gray-700">
          {editingId ? "Edit note" : "Add new note"}
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => setType("bug")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                type === "bug"
                  ? "bg-brand-red text-white"
                  : "border bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Bug
            </button>
            <button
              onClick={() => setType("note")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                type === "note"
                  ? "bg-brand-black text-white"
                  : "border bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Note
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Description..."
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              onClick={editingId ? () => handleUpdate(editingId) : handleAdd}
              className="rounded-md bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              {editingId ? "Update" : "Add"}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Notes List */}
      {!loading && sorted.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
          No notes yet.
        </div>
      ) : !loading ? (
        <div className="space-y-3">
          {sorted.map((note) => (
            <div
              key={note.id}
              className={`rounded-xl border p-5 shadow-sm ${
                note.resolved ? "bg-gray-50 opacity-75" : "bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        note.type === "bug"
                          ? "bg-brand-red text-white"
                          : "bg-brand-black text-white"
                      }`}
                    >
                      {note.type === "bug" ? "BUG" : "NOTE"}
                    </span>
                    {note.resolved && (
                      <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                        Resolved
                      </span>
                    )}
                    <div className="text-xs text-gray-500">
                      {new Date(note.createdAt).toLocaleDateString("en-SG", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className={`mt-2 text-sm font-semibold ${note.resolved ? "line-through" : ""}`}>
                    {note.title}
                  </div>
                  <div className={`mt-1 text-sm text-gray-700 whitespace-pre-wrap ${note.resolved ? "line-through" : ""}`}>
                    {note.content}
                  </div>
                </div>

                <div className="flex gap-2">
                  {!note.resolved && (
                    <button
                      onClick={() => startEdit(note)}
                      className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleResolved(note.id)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      note.resolved
                        ? "border bg-white text-gray-700 hover:bg-gray-50"
                        : "bg-green-600 text-white hover:opacity-95"
                    }`}
                  >
                    {note.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}



