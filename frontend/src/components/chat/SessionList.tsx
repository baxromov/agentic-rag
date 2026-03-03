import React from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { ChatSession } from "../../types/session";

interface SessionListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function groupByDate(sessions: ChatSession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updated_at || s.created_at);
    if (d >= today) groups[0].items.push(s);
    else if (d >= yesterday) groups[1].items.push(s);
    else if (d >= lastWeek) groups[2].items.push(s);
    else groups[3].items.push(s);
  }

  return groups.filter((g) => g.items.length > 0);
}

function relativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
}) => {
  const groups = groupByDate(sessions);

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-text-muted text-xs">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-4 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
            {group.label}
          </p>
          {group.items.map((session) => {
            const isActive = session.thread_id === activeSessionId;
            return (
              <div
                key={session.thread_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(session.thread_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(session.thread_id);
                }}
                className={`group w-full flex items-center gap-2 px-4 py-2.5 text-left transition-all duration-150 rounded-lg mx-0 cursor-pointer ${
                  isActive
                    ? "bg-hover/50 border-l-2 border-blue-500 text-text-primary"
                    : "text-text-secondary hover:bg-input/60 border-l-2 border-transparent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">
                    {session.title || "New Chat"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {relativeTime(session.updated_at || session.created_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.thread_id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-hover rounded transition-all"
                  title="Delete"
                >
                  <TrashIcon className="w-3.5 h-3.5 text-text-secondary hover:text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
