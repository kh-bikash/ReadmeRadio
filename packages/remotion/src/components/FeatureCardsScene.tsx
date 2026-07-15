import React from "react";
import { spring, interpolate } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface FeatureCardsSceneProps {
  features: string[];
  title: string;
  startFrame: number;
  endFrame: number;
}

export const FeatureCardsScene: React.FC<FeatureCardsSceneProps> = ({ features, title, startFrame, endFrame }) => {
  const { fps, local, duration, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  // Reveal cadence scales to the scene's actual duration so a short scene doesn't
  // get cut off mid-reveal and a long one doesn't sit idle after all cards are in.
  const shownFeatures = features.slice(0, 6);
  const revealWindow = Math.max(1, duration - 40);
  const revealStep = shownFeatures.length > 1 ? revealWindow / shownFeatures.length : 0;
  const visibleCount = shownFeatures.length > 0 ? Math.min(shownFeatures.length, Math.floor(local / Math.max(1, revealStep)) + 1) : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        padding: "32px 48px",
        overflow: "hidden",
      }}
    >
      <h2 style={{ ...theme.type.heading2, color: theme.ink, marginBottom: 20, flexShrink: 0 }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, justifyContent: "center", maxWidth: 800, overflow: "hidden" }}>
        {shownFeatures.map((feature, i) => {
          if (i >= visibleCount) return null;
          const cardLocal = local - i * 18;
          const cardSpring = spring({ frame: cardLocal, fps, config: { damping: 18, stiffness: 60, mass: 1.2 } });
          const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);
          const slideX = interpolate(cardSpring, [0, 1], [-40, 0]);

          return (
            <div
              key={i}
              style={{
                opacity: cardOpacity,
                transform: `translateX(${slideX}px)`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 24px",
                borderRadius: theme.rounded.lg,
                background: theme.surface,
                border: `1px solid ${theme.hairline}`,
                boxShadow: theme.shadow.soft,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: theme.rounded.md,
                  background: theme.primary,
                  color: theme.onPrimary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <span style={{ ...theme.type.bodyMd, fontSize: 18, color: theme.inkSecondary, fontWeight: 500 }}>
                {feature}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
