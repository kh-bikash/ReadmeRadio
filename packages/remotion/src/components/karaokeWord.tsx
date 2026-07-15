import React from "react";
import { spring } from "remotion";
import { theme } from "../theme";
import type { WordTiming } from "../MainVideo";

// Shared per-word karaoke rendering: a word springs in as it's approached and
// is colored by whether it's currently being spoken, already spoken, or upcoming.
// Used by SubtitleBar (caption-synced) and available for any other karaoke-style text.
export function renderKaraokeWord(
  word: string,
  wordTiming: WordTiming | undefined,
  currentTime: number,
  frame: number,
  fps: number,
  key: React.Key,
) {
  const isActive = !!wordTiming && currentTime >= wordTiming.start && currentTime <= wordTiming.end;
  const isPast = !!wordTiming && currentTime > wordTiming.end;

  const localFrame = frame - Math.round((wordTiming?.start ?? 0) * fps);
  const entrance = spring({ frame: localFrame, fps, config: theme.spring.snappy });
  const opacity = wordTiming ? Math.min(1, 0.4 + entrance * 0.6) : 1;
  const translateY = wordTiming ? (1 - entrance) * 5 : 0;

  return (
    <span
      key={key}
      style={{
        display: "inline-block",
        color: isActive ? theme.primary : isPast ? theme.inkSecondary : theme.ink,
        fontWeight: isActive ? 700 : 600,
        opacity,
        transform: `translateY(${translateY}px)`,
        marginRight: "0.28em",
        filter: isActive ? "drop-shadow(0 1px 2px rgba(0,117,222,0.2))" : "none",
      }}
    >
      {word}
    </span>
  );
}
