"use client";

import { useState, useEffect, useRef } from "react";
import type { ConversationQuestion } from "@/lib/cartographer/conversation";

interface ConversationStepProps {
  fromApp: string | null;
  onComplete: () => void;
}

export function ConversationStep({
  fromApp,
  onComplete,
}: ConversationStepProps) {
  const [currentQuestion, setCurrentQuestion] =
    useState<ConversationQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<
    HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement | null
  >(null);

  const fetchNextQuestion = async (history: string[]) => {
    setLoading(true);
    setFeedback(null);
    setAnswer("");

    try {
      const res = await fetch("/api/cartographer/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next_question",
          questionHistory: history,
          fromApp,
        }),
      });

      if (!res.ok) throw new Error("Failed to get question");

      const data = await res.json();

      if (data.done) {
        onComplete();
        return;
      }

      setCurrentQuestion(data.question);
    } catch {
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNextQuestion([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, currentQuestion]);

  const handleSubmit = async () => {
    if (!currentQuestion || !answer.trim() || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/cartographer/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          question: currentQuestion.question,
          answer: answer.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed to submit answer");

      const data = await res.json();
      const summary = data.result?.extractedSummary ?? "";

      setFeedback(summary);
      const newHistory = [...questionHistory, currentQuestion.question];
      setQuestionHistory(newHistory);
      setQuestionCount((c) => c + 1);

      // Brief pause to show feedback
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await fetchNextQuestion(newHistory);
    } catch {
      setFeedback("Something went wrong. Let's move on.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  if (loading && questionCount === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6C5CE7] border-t-transparent" />
          <span className="text-sm text-gray-500">
            Preparing your first question...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">
            Question {questionCount + 1} of ~6
          </span>
          <button
            onClick={onComplete}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Skip remaining
          </button>
        </div>

        {feedback ? (
          <div className="flex items-center gap-2 rounded-lg bg-[#f0eeff] px-4 py-3">
            <svg
              className="h-4 w-4 flex-shrink-0 text-[#6C5CE7]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-[#6C5CE7]">{feedback}</span>
          </div>
        ) : currentQuestion ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900">
              {currentQuestion.question}
            </h2>

            {currentQuestion.hint && (
              <p className="mt-2 text-xs text-gray-400">
                {currentQuestion.hint}
              </p>
            )}

            <div className="mt-5">
              {currentQuestion.inputType === "select" &&
              currentQuestion.options ? (
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-[#6C5CE7] focus:outline-none"
                >
                  <option value="">Select an option</option>
                  {currentQuestion.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : currentQuestion.inputType === "textarea" ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={4}
                  placeholder="Type your answer..."
                  disabled={submitting}
                  className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6C5CE7] focus:outline-none disabled:opacity-50"
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type your answer..."
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6C5CE7] focus:outline-none disabled:opacity-50"
                />
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !answer.trim()}
              className="mt-5 w-full rounded-lg bg-[#6C5CE7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6] disabled:opacity-50"
            >
              {submitting ? "Processing..." : "Continue"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
