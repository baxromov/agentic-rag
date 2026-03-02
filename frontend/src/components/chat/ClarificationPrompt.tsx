import React, { useState } from "react";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

interface ClarificationPromptProps {
  question: string;
  onRespond: (response: string) => void;
  onSkip: () => void;
}

export const ClarificationPrompt: React.FC<ClarificationPromptProps> = ({
  question,
  onRespond,
  onSkip,
}) => {
  const [response, setResponse] = useState("");

  const handleSubmit = () => {
    if (!response.trim()) return;
    onRespond(response.trim());
    setResponse("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5 mx-2">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <QuestionMarkCircleIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-300 mb-1">
            Clarification needed
          </p>
          <p className="text-amber-200 text-sm">{question}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleSubmit}
          disabled={!response.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Send
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2.5 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors hover:bg-slate-800"
        >
          Skip
        </button>
      </div>
    </div>
  );
};
