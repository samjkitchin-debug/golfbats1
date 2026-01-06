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

const LS_KEY = "golfbats:dev-notes:v1";

function loadNotes(): DevNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DevNote[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: DevNote[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(notes));
}

export default function DevNotesPage() {
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"bug" | "note">("bug");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  function refresh() {
    setNotes(loadNotes());
  }

  function handleAdd() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) return;

    const newNote: DevNote = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      content: trimmedContent,
      type,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    const updated = [...notes, newNote];
    saveNotes(updated);
    setNotes(updated);
    setTitle("");
    setContent("");
  }

  function handleUpdate(id: string) {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) return;

    const updated = notes.map((n) =>
      n.id === id
        ? {
            ...n,
            title: trimmedTitle,
            content: trimmedContent,
            type,
          }
        : n
    );
    saveNotes(updated);
    setNotes(updated);
    setTitle("");
    setContent("");
    setEditingId(null);
  }

  function handleDelete(id: string) {
    const ok = window.confirm("Delete this note?");
    if (!ok) return;

    const updated = notes.filter((n) => n.id !== id);
    saveNotes(updated);
    setNotes(updated);
  }

  function handleToggleResolved(id: string) {
    const updated = notes.map((n) => (n.id === id ? { ...n, resolved: !n.resolved } : n));
    saveNotes(updated);
    setNotes(updated);
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

  const unresolvedCount = notes.filter((n) => !n.resolved).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold text-brand-black">Dev Notes</div>
        <div className="mt-1 text-sm text-gray-600">
          Track bugs and notes while testing. {unresolvedCount > 0 && (
            <span className="font-medium">{unresolvedCount} unresolved</span>
          )}
        </div>
      </div>

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
      {sorted.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
          No notes yet.
        </div>
      ) : (
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
      )}
    </div>
  );
}


