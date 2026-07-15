import React from "react";
import { spring, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface AnnotationSceneProps {
  title: string;
  terms: { word: string; definition: string }[];
  startFrame: number;
  endFrame: number;
}

// A key_term beat always carries exactly one real, authored {term, definition} —
// so this reads as one confident "dictionary entry" rather than a guessed list.
export const AnnotationScene: React.FC<AnnotationSceneProps> = ({ title, terms, startFrame, endFrame }) => {
  const { fps, local, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;
  const term = terms[0];
  if (!term) return null;

  const eyebrowSpring = spring({ frame: local, fps, config: theme.spring.snappy });
  const wordSpring = spring({ frame: local - 6, fps, config: theme.spring.gentle });
  const wordOpacity = interpolate(wordSpring, [0, 1], [0, 1]);
  const wordY = interpolate(wordSpring, [0, 1], [24, 0]);
  const underlineProgress = interpolate(local, [20, 45], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
  });
  const defOpacity = interpolate(local, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const defY = interpolate(local, [30, 50], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 60px", overflow: "hidden" }}>
      <div style={{ maxWidth: 720, width: "100%" }}>
        <div style={{
          ...theme.type.eyebrow, color: theme.primary, letterSpacing: "0.15em", marginBottom: 20,
          opacity: interpolate(eyebrowSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(eyebrowSpring, [0, 1], [12, 0])}px)`,
        }}>
          {title ? title.toUpperCase() : "KEY TERM"}
        </div>
        <div style={{ opacity: wordOpacity, transform: `translateY(${wordY}px)` }}>
          <span style={{ ...theme.type.display2, fontSize: 56, color: theme.ink, position: "relative", display: "inline-block" }}>
            {term.word}
            <div style={{
              position: "absolute", bottom: -6, left: 0, height: 4, borderRadius: 2,
              background: theme.primary, width: `${underlineProgress * 100}%`,
            }} />
          </span>
        </div>
        <p style={{
          ...theme.type.heading3, fontWeight: 400, color: theme.inkSecondary, marginTop: 28, lineHeight: 1.5, maxWidth: 640,
          opacity: defOpacity, transform: `translateY(${defY}px)`,
        }}>
          {term.definition}
        </p>
      </div>
    </div>
  );
};
