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
    <div className="px-4 pb-4 pt-2 bg-page">
      <form
        onSubmit={handleSubmit}
        className="relative max-w-4xl mx-auto"
      >
        <div className="relative flex items-end bg-input/80 border border-border-default/60 rounded-2xl shadow-lg shadow-black/20 focus-within:border-blue-500/50 focus-within:shadow-blue-500/5 transition-all">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "AI is responding..."
                : "Ask about company policies..."
            }
            disabled={disabled}
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 160) + "px";
            }}
            className="flex-1 px-5 py-3.5 bg-transparent outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed text-text-primary placeholder:text-text-muted text-[15px] leading-relaxed min-h-[48px] max-h-[160px]"
          />

          <div className="flex items-center gap-2 px-3 pb-2.5">
            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors"
                title="Stop generating"
              >
                <StopIcon className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!message.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-blue-600"
                title="Send message"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-2">
          Shift+Enter for new line
        </p>
      </form>
    </div>
  );
};
