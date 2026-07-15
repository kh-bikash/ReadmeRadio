import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";

export interface AtmosphereProps {
  variant?: "daylight" | "night";
  intensity?: number;
}

export const Atmosphere: React.FC<AtmosphereProps> = ({ variant = "daylight", intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (variant === "night") {
    const glow1X = interpolate(Math.sin((frame / 280) * Math.PI * 2), [-1, 1], [-8, 8]);
    const glow1Y = interpolate(Math.cos((frame / 340) * Math.PI * 2), [-1, 1], [-6, 6]);
    const sweepProgress = (frame / durationInFrames) % 1;
    const sweepX = interpolate(sweepProgress, [0, 1], [-30, 130], { easing: Easing.inOut(Easing.sin) });
    return (
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" style={{ background: theme.secondary }}>
        <div style={{ position: "absolute", top: `${10 + glow1Y}%`, left: `${20 + glow1X}%`, width: 360, height: 360, background: `radial-gradient(circle, rgba(167,139,250,${0.14 * intensity}), transparent 70%)` }} />
        <div style={{ position: "absolute", bottom: `${12}%`, right: `${18}%`, width: 280, height: 280, background: `radial-gradient(circle, rgba(98,174,240,${0.12 * intensity}), transparent 70%)` }} />
        <div style={{ position: "absolute", top: 0, left: `${sweepX}%`, width: "14%", height: "100%", background: `linear-gradient(90deg, transparent, rgba(255,255,255,${0.03 * intensity}), transparent)`, transform: "skewX(-12deg)" }} />
        {[...Array(22)].map((_, i) => {
          const sx = (i * 137.5) % 100;
          const sy = (i * 79.3) % 100;
          const tw = interpolate(Math.sin(frame * 0.04 + i * 1.3), [-1, 1], [0.15, 0.55]);
          return <div key={i} style={{ position: "absolute", left: `${sx}%`, top: `${sy}%`, width: 3, height: 3, borderRadius: "50%", background: "#fff", opacity: tw * intensity }} />;
        })}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" style={{ background: theme.canvas }}>
      <div style={{ position: "absolute", top: "-10%", left: "-8%", width: "60%", height: "60%", background: `radial-gradient(circle, rgba(0,117,222,${0.025 * intensity}), transparent 65%)` }} />
      <div style={{ position: "absolute", bottom: "-10%", right: "-8%", width: "55%", height: "55%", background: `radial-gradient(circle, rgba(98,174,240,${0.02 * intensity}), transparent 65%)` }} />
    </div>
  );
};
