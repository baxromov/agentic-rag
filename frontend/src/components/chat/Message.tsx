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

  const formatDate = (date: Date) => {
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
              : "bg-slate-800 border border-slate-700 text-slate-200"
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        <span className="text-xs text-slate-500 mt-1 px-2">
          {formatDate(message.timestamp)}
        </span>
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
