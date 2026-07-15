import React from "react";
import { spring, interpolate } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface KeyPointSceneProps {
  text: string;
  title: string;
  startFrame: number;
  endFrame: number;
}

export const KeyPointScene: React.FC<KeyPointSceneProps> = ({ text, title, startFrame, endFrame }) => {
  const { fps, local, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  const cardSpring = spring({ frame: local, fps, config: theme.spring.gentle });
  const scale = interpolate(cardSpring, [0, 1], [0.9, 1]);
  const pulseScale = 1 + Math.sin(local * 0.05) * 0.015;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 60px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          transform: `scale(${scale * pulseScale})`,
          maxWidth: 800,
          padding: "40px 48px",
          borderRadius: theme.rounded.xl,
          background: theme.surface,
          border: `2px solid ${theme.primary}`,
          boxShadow: `0 0 0 8px rgba(0,117,222,0.06), ${theme.shadow.elevated}`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            ...theme.type.eyebrow,
            color: theme.primary,
            fontSize: 14,
            marginBottom: 20,
            letterSpacing: "0.15em",
          }}
        >
          {title.toUpperCase()}
        </div>
        <p
          style={{
            ...theme.type.heading1,
            fontSize: 36,
            color: theme.ink,
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          {text}
        </p>
        <div
          style={{
            marginTop: 24,
            height: 3,
            width: 60,
            background: theme.primary,
            borderRadius: 2,
            margin: "24px auto 0",
          }}
        />
      </div>
    </div>
  );
};
