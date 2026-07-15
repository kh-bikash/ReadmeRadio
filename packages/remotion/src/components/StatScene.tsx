// Currently unused — retired because it displayed unrelated content counts
// (feature/node/code-block array lengths) mislabeled as "stats", which
// DESIGN.md's "no fake progress or decorative controls" rule forbids.
// Re-wire only if the CLI starts fetching real repo metrics (stars/forks/contributors).
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { theme } from "../theme";

export interface StatSceneProps {
  stats: { label: string; value: number; suffix?: string }[];
  title: string;
  startFrame: number;
  endFrame: number;
}

export const StatScene: React.FC<StatSceneProps> = ({ stats, title, startFrame, endFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0 || frame > endFrame) return null;

  const exitOpacity = interpolate(local, [endFrame - startFrame - 30, endFrame - startFrame], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad),
  });
  const enterOpacity = interpolate(local, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const opacity = Math.min(enterOpacity, exitOpacity);

  const titleSpring = spring({ frame: local, fps, config: theme.spring.snappy });

  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 20, display: "flex", flexDirection: "column", padding: "32px 48px", overflow: "hidden" }}>
      <h2 style={{
        ...theme.type.heading2, color: theme.ink, marginBottom: 32, flexShrink: 0,
        opacity: interpolate(titleSpring, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(titleSpring, [0, 1], [16, 0])}px)`,
      }}>
        {title}
      </h2>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
        {stats.slice(0, 4).map((stat, i) => {
          const statLocal = local - 15 - i * 15;
          const statSpring = spring({ frame: statLocal, fps, config: theme.spring.gentle });
          const statOpacity = interpolate(statSpring, [0, 1], [0, 1]);
          const statScale = interpolate(statSpring, [0, 1], [0.7, 1]);
          const statY = interpolate(statSpring, [0, 1], [30, 0]);

          // Count-up animation
          const countProgress = interpolate(statLocal, [0, 40], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
          });
          const displayValue = Math.round(stat.value * countProgress);

          return (
            <div key={i} style={{
              opacity: statOpacity, transform: `translateY(${statY}px) scale(${statScale})`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              padding: "24px 32px", borderRadius: theme.rounded.xl,
              background: theme.surface, border: `1px solid ${theme.hairline}`,
              boxShadow: theme.shadow.soft, minWidth: 140,
            }}>
              <div style={{
                fontSize: 48, fontWeight: 800, color: theme.primary,
                fontFamily: "Inter, sans-serif", letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}>
                {displayValue >= 1000 ? `${(displayValue / 1000).toFixed(1)}K` : displayValue}
                {stat.suffix && <span style={{ fontSize: 24, color: theme.inkMuted }}>{stat.suffix}</span>}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 500, color: theme.inkMuted,
                textAlign: "center", lineHeight: 1.3,
              }}>
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
