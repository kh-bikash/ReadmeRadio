import React from "react";
import { spring, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface TopicCardSceneProps {
  title: string;
  subtitle: string;
  startFrame: number;
  endFrame: number;
}

export const TopicCardScene: React.FC<TopicCardSceneProps> = ({ title, subtitle, startFrame, endFrame }) => {
  const { fps, local, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  const titleSpring = spring({ frame: local, fps, config: theme.spring.gentle });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);
  const subSpring = spring({ frame: local - 8, fps, config: theme.spring.gentle });
  const subY = interpolate(subSpring, [0, 1], [20, 0]);
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);

  const barWidth = interpolate(local, [0, 30], [0, 120], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 60px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 4,
          width: barWidth,
          background: theme.primary,
          borderRadius: 2,
          marginBottom: 24,
        }}
      />
      <h2
        style={{
          ...theme.type.display2,
          color: theme.ink,
          margin: 0,
          transform: `translateY(${titleY}px)`,
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            ...theme.type.heading3,
            color: theme.inkMuted,
            marginTop: 16,
            fontWeight: 400,
            transform: `translateY(${subY}px)`,
            opacity: subOpacity,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
