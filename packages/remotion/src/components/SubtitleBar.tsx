import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme } from "../theme";
import type { WordTiming } from "../MainVideo";
import { renderKaraokeWord } from "./karaokeWord";

export interface SubtitleBarProps {
  words: WordTiming[];
  captions: { start: number; end: number; text: string }[];
}

export const SubtitleBar: React.FC<SubtitleBarProps> = ({ words, captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find((c) => currentTime >= c.start && currentTime <= c.end);
  if (!activeCaption) return null;

  const localFrame = frame - Math.round(activeCaption.start * fps);
  const entrance = spring({ frame: localFrame, fps, config: theme.spring.snappy });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [8, 0]);

  const captionWords = activeCaption.text.split(/\s+/);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 64,
        left: "50%",
        transform: `translateX(-50%) translateY(${translateY}px)`,
        opacity,
        maxWidth: "80%",
        zIndex: 25,
        padding: "10px 24px",
        borderRadius: theme.rounded.xl,
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${theme.hairline}`,
        boxShadow: theme.shadow.soft,
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.4,
          color: theme.ink,
          margin: 0,
        }}
      >
        {captionWords.map((word, i) => {
          const wordTiming = words.find(
            (wt) => wt.word.replace(/[.,!?;:]/g, "") === word.replace(/[.,!?;:]/g, "") &&
            wt.start >= activeCaption.start - 0.3 &&
            wt.start <= activeCaption.end + 0.3
          );
          return renderKaraokeWord(word, wordTiming, currentTime, frame, fps, i);
        })}
      </p>
    </div>
  );
};
