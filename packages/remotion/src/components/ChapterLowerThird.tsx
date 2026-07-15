import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { theme } from "../theme";

export interface ChapterLowerThirdProps {
  index: number;
  label: string;
  startFrame: number;
  visibleFrames?: number;
}

export const ChapterLowerThird: React.FC<ChapterLowerThirdProps> = ({ index, label, startFrame, visibleFrames = 90 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0 || local > visibleFrames) return null;

  const enter = spring({ frame: local, fps, config: theme.spring.snappy });
  const exit = interpolate(local, [visibleFrames - 18, visibleFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad),
  });
  const opacity = Math.min(enter, exit);
  const slideX = interpolate(enter, [0, 1], [-32, 0]);

  return (
    <div style={{
      position: "absolute", left: 0, bottom: 88, opacity,
      transform: `translateX(${slideX}px)`,
      display: "flex", alignItems: "center", gap: 12, zIndex: 30,
    }}>
      <div style={{ width: 3, height: 24, background: theme.primary, borderRadius: 2 }} />
      <span style={{ ...theme.type.eyebrow, color: theme.primary }}>
        {String(index).padStart(2, "0")}
      </span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: theme.inkSecondary,
        letterSpacing: "0.03em", textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
};
