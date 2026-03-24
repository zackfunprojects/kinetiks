"use client";

import { useEffect, useState } from "react";

interface ConfidenceRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ConfidenceRing({
  score,
  size = 120,
  strokeWidth = 8,
  label,
}: ConfidenceRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const duration = 800;
    const start = performance.now();
    const target = Math.min(Math.max(score, 0), 100);

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;
  const center = size / 2;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#6C5CE7"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: size * 0.28,
              fontWeight: 700,
              color: "#1a1a2e",
              lineHeight: 1,
            }}
          >
            {animatedScore}%
          </span>
        </div>
      </div>
      {label && (
        <span style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
          {label}
        </span>
      )}
    </div>
  );
}
