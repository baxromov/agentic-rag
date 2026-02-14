/**
 * Individual message component
 */

import { UserIcon, CpuChipIcon } from "@heroicons/react/24/outline";

interface MessageProps {
  message: {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  };
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === "user";

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
            <CpuChipIcon className="w-5 h-5 text-white" />
          </div>
        </div>
      )}

      <div className={`flex-1 max-w-3xl ${isUser ? "flex justify-end" : ""}`}>
        <div
          className={`rounded-2xl px-5 py-4 shadow-sm ${
            isUser
              ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
              : "bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200"
          }`}
        >
          <div
            className={`prose max-w-none ${isUser ? "prose-invert" : "prose-slate"}`}
          >
            <p
              className={`whitespace-pre-wrap ${isUser ? "text-white" : "text-slate-800"}`}
            >
              {message.content}
            </p>
          </div>
          <div
            className={`mt-2 text-xs ${isUser ? "text-blue-100" : "text-slate-500"}`}
          >
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-md">
            <UserIcon className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
};
