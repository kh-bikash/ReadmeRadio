import React from "react";
import { spring, interpolate } from "remotion";
import { theme, nodeAccent, inferNodeKind } from "../theme";
import type { NodeLayoutItem } from "../MainVideo";
import { useSceneFrame } from "./useSceneFrame";

export interface FlowSceneProps {
  nodes: NodeLayoutItem[];
  cueTimes: Record<string, number>;
  currentTime: number;
  startFrame: number;
  endFrame: number;
}

export const FlowScene: React.FC<FlowSceneProps> = ({ nodes, cueTimes, currentTime, startFrame, endFrame }) => {
  const { frame, fps, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  // Determine which steps are visible and active
  const sortedNodes = [...nodes].sort((a, b) => (cueTimes[a.id] ?? 0) - (cueTimes[b.id] ?? 0));
  const visibleCount = sortedNodes.filter((n) => currentTime >= (cueTimes[n.id] ?? 0)).length;
  const activeNode = sortedNodes.find((n) => {
    const cue = cueTimes[n.id] ?? 0;
    return currentTime >= cue && currentTime <= cue + 4;
  });

  const stepH = 56;
  const stepGap = 16;

  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 20, display: "flex", flexDirection: "column", padding: "32px 48px", overflow: "hidden" }}>
      <h2 style={{ ...theme.type.heading2, color: theme.ink, marginBottom: 24, flexShrink: 0 }}>How it works</h2>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: stepGap, justifyContent: "center", maxWidth: 700 }}>
        {sortedNodes.map((node, i) => {
          if (i >= visibleCount) return null;
          const kind = inferNodeKind(node.label);
          const accent = nodeAccent[kind];
          const isActive = activeNode?.id === node.id;
          const cue = cueTimes[node.id] ?? 0;
          const cueFrame = Math.round(cue * fps);
          const stepLocal = frame - cueFrame;
          const stepSpring = spring({ frame: stepLocal, fps, config: theme.spring.snappy });
          const stepOpacity = interpolate(stepSpring, [0, 1], [0, 1]);
          const slideX = interpolate(stepSpring, [0, 1], [-60, 0]);

          return (
            <div key={node.id} style={{ opacity: stepOpacity, transform: `translateX(${slideX}px)` }}>
              {/* Connector arrow */}
              {i > 0 && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                  <svg width="20" height="20" viewBox="0 0 20 20">
                    <path d="M10 2 L10 14 M5 10 L10 15 L15 10" fill="none"
                      stroke={isActive ? theme.primary : theme.hairline}
                      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      opacity={isActive ? 0.9 : 0.3} />
                  </svg>
                </div>
              )}
              <div style={{
                display: "flex", alignItems: "center", gap: 16, padding: "14px 24px",
                borderRadius: theme.rounded.lg, height: stepH,
                background: isActive ? `linear-gradient(135deg, ${accent.bg}, rgba(0,117,222,0.04))` : theme.surface,
                border: `${isActive ? 2 : 1}px solid ${isActive ? theme.primary : theme.hairline}`,
                boxShadow: isActive ? `0 0 0 3px rgba(0,117,222,0.06), 0 8px 24px rgba(0,117,222,0.1)` : "0 2px 6px rgba(0,0,0,0.03)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: theme.rounded.md,
                  background: isActive ? theme.primary : accent.bg,
                  color: isActive ? theme.onPrimary : accent.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, fontFamily: "monospace", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, color: isActive ? theme.ink : theme.inkSecondary, flex: 1 }}>
                  {node.label}
                </span>
                {isActive && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: theme.primary,
                    boxShadow: `0 0 10px ${theme.primary}`,
                    opacity: interpolate(Math.sin(frame * 0.15), [-1, 1], [0.5, 1]),
                    transform: `scale(${interpolate(Math.sin(frame * 0.15), [-1, 1], [0.85, 1.1])})`,
                  }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
