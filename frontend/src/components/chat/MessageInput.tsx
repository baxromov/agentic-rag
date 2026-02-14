/**
 * Message input with send button
 */

import { useState } from "react";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/outline";

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  onStop?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled,
  onStop,
}) => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled
            ? "AI is responding..."
            : "Type your message... (Shift+Enter for new line)"
        }
        disabled={disabled}
        rows={3}
        className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      />

      {disabled ? (
        <button
          type="button"
          onClick={onStop}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-lg"
        >
          <StopIcon className="w-5 h-5" />
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!message.trim()}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
          Send
        </button>
      )}
    </form>
  );
};
