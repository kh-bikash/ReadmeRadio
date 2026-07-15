import React from "react";
import { spring, interpolate } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface ComparisonSceneProps {
  title: string;
  leftLabel: string;
  leftItems: string[];
  rightLabel: string;
  rightItems: string[];
  startFrame: number;
  endFrame: number;
}

export const ComparisonScene: React.FC<ComparisonSceneProps> = ({
  title, leftLabel, leftItems, rightLabel, rightItems, startFrame, endFrame,
}) => {
  const { fps, local, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  const titleSpring = spring({ frame: local, fps, config: theme.spring.snappy });

  const Col: React.FC<{ label: string; items: string[]; positive: boolean; delay: number }> = ({ label, items, positive, delay }) => {
    const colSpring = spring({ frame: local - delay, fps, config: theme.spring.gentle });
    const colOpacity = interpolate(colSpring, [0, 1], [0, 1]);
    const colX = interpolate(colSpring, [0, 1], [positive ? 30 : -30, 0]);
    const accent = positive ? theme.primary : theme.inkFaint;
    const bg = positive ? "rgba(0,117,222,0.04)" : "rgba(0,0,0,0.02)";

    return (
      <div style={{
        flex: 1, opacity: colOpacity, transform: `translateX(${colX}px)`,
        padding: 24, borderRadius: theme.rounded.lg, background: bg,
        border: `1px solid ${positive ? `${theme.primary}33` : theme.hairline}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: positive ? theme.primary : "rgba(0,0,0,0.05)",
            color: positive ? theme.onPrimary : theme.inkMuted,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
          }}>
            {positive ? "✓" : "✕"}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: positive ? theme.ink : theme.inkMuted, margin: 0 }}>
            {label}
          </h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.slice(0, 5).map((item, i) => {
            const itemLocal = local - delay - 10 - i * 12;
            const itemSpring = spring({ frame: itemLocal, fps, config: theme.spring.snappy });
            const itemOpacity = interpolate(itemSpring, [0, 1], [0, 1]);
            const itemY = interpolate(itemSpring, [0, 1], [12, 0]);
            return (
              <div key={i} style={{
                opacity: itemOpacity, transform: `translateY(${itemY}px)`,
                display: "flex", alignItems: "flex-start", gap: 10,
                fontSize: 14, color: positive ? theme.inkSecondary : theme.inkMuted,
                lineHeight: 1.4,
              }}>
                <span style={{ color: accent, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                  {positive ? "▸" : "•"}
                </span>
                <span>{item}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 20, display: "flex", flexDirection: "column", padding: "32px 48px", overflow: "hidden" }}>
      <h2 style={{
        ...theme.type.heading2, color: theme.ink, marginBottom: 28, flexShrink: 0,
        opacity: interpolate(titleSpring, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(titleSpring, [0, 1], [16, 0])}px)`,
      }}>
        {title}
      </h2>
      <div style={{ display: "flex", gap: 24, flex: 1, alignItems: "stretch" }}>
        <Col label={leftLabel} items={leftItems} positive={false} delay={8} />
        <Col label={rightLabel} items={rightItems} positive={true} delay={16} />
      </div>
    </div>
  );
};
