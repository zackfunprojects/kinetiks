"use client";

import { useState, useEffect, useRef } from "react";
import type { ConversationQuestion } from "@/lib/cartographer/conversation";
import { StepWrapper } from "./StepWrapper";
import { AiFillBanner } from "./AiFillBanner";
import { SparkleButton } from "./SparkleButton";

interface ConversationStepProps {
  fromApp: string | null;
  onComplete: () => void;
  onBack: () => void;
  businessContext: string;
  stepNumber: number;
  totalSteps: number;
}

export function ConversationStep({
  fromApp,
  onComplete,
  onBack,
  businessContext,
  stepNumber,
  totalSteps,
}: ConversationStepProps) {
  const [currentQuestion, setCurrentQuestion] =
    useState<ConversationQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
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

      const json = await res.json();
      const data = json.data ?? json;

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

      const json = await res.json();
      const data = json.data ?? json;
      const summary = data.result?.extractedSummary ?? "";

      setFeedback(summary);
      const newHistory = [...questionHistory, currentQuestion.question];
      setQuestionHistory(newHistory);
      setQuestionCount((c) => c + 1);

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

  const handleAiFill = async () => {
    if (!currentQuestion || !businessContext || aiFilling) return;
    setAiFilling(true);

    try {
      const res = await fetch("/api/cartographer/auto-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          businessContext,
        }),
      });

      if (!res.ok) throw new Error("Auto-answer failed");

      const json = await res.json();
      const generatedAnswer = json.data?.answer ?? "";
      if (generatedAnswer) {
        setAnswer(generatedAnswer);
      }
    } catch {
      // Silently fail - user can still type manually
    } finally {
      setAiFilling(false);
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

  const inputStyles = {
    border: "1px solid var(--border-default)",
    background: "var(--bg-inset)",
    color: "var(--text-primary)",
  };

  if (loading && questionCount === 0) {
    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Tell us about your business"
        subtitle="Preparing your first question..."
        isOptional
        onBack={onBack}
        onSkip={onComplete}
        hideContinue
      >
        <div className="flex items-center gap-3 py-8">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
            Preparing your first question...
          </span>
        </div>
      </StepWrapper>
    );
  }

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title={currentQuestion?.question ?? "Tell us about your business"}
      subtitle={currentQuestion?.hint ?? undefined}
      isOptional
      onBack={onBack}
      onSkip={onComplete}
      onContinue={handleSubmit}
      continueLabel={submitting ? "Processing..." : "Continue"}
      continueDisabled={submitting || !answer.trim()}
      loading={submitting}
    >
      {/* Question counter */}
      <div className="mb-4">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
        >
          Question {questionCount + 1} of ~6
        </span>
      </div>

      {feedback ? (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3"
          style={{ background: "var(--accent-muted)" }}
        >
          <svg
            className="h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="var(--accent)"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm" style={{ color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
            {feedback}
          </span>
        </div>
      ) : currentQuestion ? (
        <>
          {/* AI Fill Banner */}
          <AiFillBanner
            onFillAll={handleAiFill}
            loading={aiFilling}
            disabled={!businessContext}
            disabledReason="Crawl your website first to enable AI fill"
          />

          {/* Input field with sparkle button */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Your answer
              </span>
              <SparkleButton
                onFill={handleAiFill}
                loading={aiFilling}
                disabled={!businessContext}
                label="AI fill"
              />
            </div>

            {currentQuestion.inputType === "select" && currentQuestion.options ? (
              <select
                ref={inputRef as React.RefObject<HTMLSelectElement>}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="w-full rounded-lg px-4 py-3 text-sm"
                style={inputStyles}
              >
                <option value="">Select an option</option>
                {currentQuestion.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
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
                className="w-full resize-none rounded-lg px-4 py-3 text-sm disabled:opacity-50"
                style={inputStyles}
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
                className="w-full rounded-lg px-4 py-3 text-sm disabled:opacity-50"
                style={inputStyles}
              />
            )}
          </div>
        </>
      ) : null}
    </StepWrapper>
  );
}
