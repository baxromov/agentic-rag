import React, { useState } from "react";
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
} from "@heroicons/react/24/outline";
import type { MessageFeedback as FeedbackType } from "../../types/session";

interface MessageFeedbackProps {
  messageIndex: number;
  existingFeedback?: FeedbackType;
  onSubmit: (
    messageIndex: number,
    rating: "up" | "down",
    note?: string,
  ) => void;
}

export const MessageFeedback: React.FC<MessageFeedbackProps> = ({
  messageIndex,
  existingFeedback,
  onSubmit,
}) => {
  const [rating, setRating] = useState<"up" | "down" | null>(
    existingFeedback?.rating || null,
  );
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(existingFeedback?.note || "");

  const handleUp = () => {
    if (rating === "up") return;
    setRating("up");
    setShowNote(false);
    onSubmit(messageIndex, "up");
  };

  const handleDown = () => {
    if (rating === "down") return;
    setRating("down");
    setShowNote(true);
  };

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    onSubmit(messageIndex, "down", note.trim());
    setShowNote(false);
  };

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex items-center gap-1">
        <button
          onClick={handleUp}
          className={`p-1 rounded transition-colors ${
            rating === "up"
              ? "text-green-500"
              : "text-text-muted hover:text-text-secondary"
          }`}
          title="Helpful"
        >
          <HandThumbUpIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleDown}
          className={`p-1 rounded transition-colors ${
            rating === "down"
              ? "text-red-500"
              : "text-text-muted hover:text-text-secondary"
          }`}
          title="Not helpful"
        >
          <HandThumbDownIcon className="w-4 h-4" />
        </button>
      </div>

      {showNote && (
        <div className="flex gap-2 items-end">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was wrong with this response?"
            className="flex-1 bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-blue-500"
            rows={2}
          />
          <button
            onClick={handleSubmitNote}
            disabled={!note.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-hover disabled:text-text-muted text-white text-sm rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
};
