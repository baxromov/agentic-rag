import React, { useEffect, useState } from "react";
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

interface FeedbackItem {
  _id: string;
  user_id: string;
  username: string;
  thread_id: string;
  message_index: number;
  rating: "up" | "down";
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const FeedbackList: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");

  const fetchFeedbacks = async (rating?: string) => {
    setLoading(true);
    try {
      const url = rating
        ? `${API_BASE_URL}/admin/feedbacks?rating=${rating}`
        : `${API_BASE_URL}/admin/feedbacks`;
      const res = await apiFetch(url);
      if (res.ok) {
        setFeedbacks(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch feedbacks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks(filter === "all" ? undefined : filter);
  }, [filter]);

  const upCount = feedbacks.filter((f) => f.rating === "up").length;
  const downCount = feedbacks.filter((f) => f.rating === "down").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-page">
        <div className="w-12 h-12 border-4 border-border-default border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-page">
      <div className="p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
              <HandThumbUpIcon className="w-8 h-8 text-blue-400" />
              User Feedback
            </h1>
            <p className="text-text-secondary mt-1">
              Review user feedback on assistant responses
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border-default rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-text-primary">
              {feedbacks.length}
            </p>
            <p className="text-sm text-text-secondary">Total</p>
          </div>
          <div className="bg-card border border-green-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{upCount}</p>
            <p className="text-sm text-text-secondary">Positive</p>
          </div>
          <div className="bg-card border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{downCount}</p>
            <p className="text-sm text-text-secondary">Negative</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-6">
          <FunnelIcon className="w-5 h-5 text-text-secondary" />
          <span className="text-sm text-text-secondary">Filter:</span>
          {(["all", "up", "down"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-input text-text-secondary hover:bg-hover"
              }`}
            >
              {f === "all" ? "All" : f === "up" ? "Positive" : "Negative"}
            </button>
          ))}
        </div>

        {/* Feedback List */}
        {feedbacks.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            No feedback found
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => (
              <div
                key={fb._id}
                className={`bg-card border rounded-xl p-4 ${
                  fb.rating === "up"
                    ? "border-green-500/20"
                    : "border-red-500/20"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {fb.rating === "up" ? (
                      <HandThumbUpIcon className="w-5 h-5 text-green-400" />
                    ) : (
                      <HandThumbDownIcon className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-text-primary">
                        {fb.username}
                      </span>
                      <span className="text-text-muted mx-2">|</span>
                      <span className="text-xs text-text-muted font-mono">
                        Session: {fb.thread_id.slice(0, 8)}...
                      </span>
                      <span className="text-text-muted mx-2">|</span>
                      <span className="text-xs text-text-muted">
                        Message #{fb.message_index}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-text-muted">
                    {fb.updated_at
                      ? new Date(fb.updated_at).toLocaleString()
                      : ""}
                  </span>
                </div>
                {fb.note && (
                  <div className="mt-3 ml-8 p-3 bg-input rounded-lg">
                    <p className="text-sm text-text-secondary">{fb.note}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
