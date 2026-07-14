import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import type { CaptionItem } from "./Root";

export interface NodeLayoutItem {
  id: string;
  label: string;
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface ConnectionItem {
  from: string;
  to: string;
}

export interface AdvancedMainVideoProps {
  [key: string]: unknown;
  title: string;
  script: string;
  captions: CaptionItem[];
  mermaidCode: string;
  duration: number;
  layout?: Record<string, NodeLayoutItem>;
  connections?: ConnectionItem[];
  audioUrl: string;
  aspectRatio?: "16:9" | "1:1" | "9:16";
}

// Design-space size the layout coordinates from the CLI are computed in.
// The flowchart is rendered inside an SVG viewBox of this size, so it always
// scales to fit its panel exactly instead of overflowing or clipping.
const CANVAS_W = 640;
const CANVAS_H = 480;
const CARD_W = 180;
const CARD_H = 68;

function ParticleField() {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 16 });

  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      {particles.map((_, i) => {
        const speed = 0.15 + (i % 5) * 0.05;
        const baseX = (i * 137.5) % 100;
        const baseY = (i * 79.3) % 100;
        const driftX = Math.sin(frame * 0.01 * speed + i) * 30;
        const driftY = Math.cos(frame * 0.008 * speed + i * 1.3) * 30;
        const size = 40 + (i % 4) * 30;
        const opacity = 0.035 + (i % 3) * 0.02;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(${baseX}% + ${driftX}px)`,
              top: `calc(${baseY}% + ${driftY}px)`,
              width: size,
              height: size,
              borderRadius: "9999px",
              background:
                i % 2 === 0
                  ? "radial-gradient(circle, rgba(167,139,250,0.5), transparent 70%)"
                  : "radial-gradient(circle, rgba(96,165,250,0.35), transparent 70%)",
              filter: "blur(2px)",
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}

function KineticText({
  text,
  localFrame,
  fps,
  className,
}: {
  text: string;
  localFrame: number;
  fps: number;
  className?: string;
}) {
  const words = text.split(" ");
  const stagger = 2.5;

  return (
    <p className={className}>
      {words.map((word, i) => {
        const wordFrame = localFrame - i * stagger;
        const s = spring({
          frame: wordFrame,
          fps,
          config: { damping: 14, stiffness: 120 },
        });
        const opacity = interpolate(s, [0, 1], [0, 1]);
        const translateY = interpolate(s, [0, 1], [14, 0]);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${translateY}px)`,
              marginRight: "0.3em",
            }}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
}

function IntroScene({ title, introFrames, fps }: { title: string; introFrames: number; fps: number }) {
  const frame = useCurrentFrame();
  if (frame > introFrames) return null;

  const outStart = introFrames - 18;
  const inSpring = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const scale = interpolate(inSpring, [0, 1], [0.85, 1]);
  const opacityIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const opacityOut = interpolate(frame, [outStart, introFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const opacity = Math.min(opacityIn, opacityOut);
  const exitScale = interpolate(frame, [outStart, introFrames], [1, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = 0.85 + Math.sin(frame * 0.2) * 0.15;

  return (
    <AbsoluteFill
      style={{ opacity, zIndex: 50 }}
      className="items-center justify-center bg-[#070709]"
    >
      <div
        style={{ transform: `scale(${scale * exitScale})` }}
        className="flex flex-col items-center gap-6"
      >
        <div
          style={{ transform: `scale(${pulse})` }}
          className="w-24 h-24 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shadow-[0_0_60px_rgba(167,139,250,0.4)]"
        >
          <div className="w-10 h-10 rounded-full bg-purple-400" />
        </div>
        <span className="text-xs font-mono tracking-[0.3em] text-purple-300">
          README RADIO
        </span>
        <h1 className="text-6xl font-extrabold text-center bg-gradient-to-r from-white to-purple-300 bg-clip-text text-transparent px-12 max-w-5xl">
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  );
}

function OutroScene({
  title,
  outroStart,
  totalFrames,
  fps,
}: {
  title: string;
  outroStart: number;
  totalFrames: number;
  fps: number;
}) {
  const frame = useCurrentFrame();
  if (frame < outroStart) return null;

  const local = frame - outroStart;
  const s = spring({ frame: local, fps, config: { damping: 14, stiffness: 90 } });
  const scale = interpolate(s, [0, 1], [0.9, 1]);
  const opacity = interpolate(local, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeToBlack = interpolate(frame, [totalFrames - 12, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spin = frame * 1.2;

  return (
    <AbsoluteFill style={{ zIndex: 50 }} className="items-center justify-center">
      <AbsoluteFill style={{ opacity, backgroundColor: "#070709" }} className="items-center justify-center">
        <div style={{ transform: `scale(${scale})` }} className="flex flex-col items-center gap-5">
          <div style={{ transform: `rotate(${spin}deg)` }} className="text-4xl">
            ✦
          </div>
          <h2 className="text-3xl font-bold text-white/90">Thanks for tuning in</h2>
          <p className="text-lg font-mono text-purple-300">{title}</p>
          <span className="text-sm text-white/40 tracking-widest uppercase mt-2">
            Generated by README Radio
          </span>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeToBlack }} />
    </AbsoluteFill>
  );
}

export const MainVideo: React.FC<AdvancedMainVideoProps> = ({
  title,
  captions = [],
  duration = 60,
  layout = {},
  connections = [],
  audioUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const currentTime = frame / fps;
  const isPortrait = height > width;
  const isSquare = height === width;

  const introFrames = Math.min(60, Math.floor(durationInFrames * 0.2));
  const outroFrames = Math.min(75, Math.floor(durationInFrames * 0.2));
  const outroStart = durationInFrames - outroFrames;

  // Subtle Ken Burns camera drift across the whole scene.
  const camScale = interpolate(Math.sin((frame / (fps * 6)) * Math.PI * 2), [-1, 1], [1, 1.025]);

  // Subtitles logic
  const activeIndex = captions.findIndex(
    (c) => currentTime >= c.start && currentTime <= c.end
  );

  const currentCaption = activeIndex !== -1 ? captions[activeIndex] : null;
  const prevCaption = activeIndex > 0 ? captions[activeIndex - 1] : null;
  const nextCaption = activeIndex !== -1 && activeIndex < captions.length - 1 ? captions[activeIndex + 1] : null;
  const captionLocalFrame = currentCaption ? frame - Math.round(currentCaption.start * fps) : 0;

  // Node highlighting based on current timestamp
  const nodesList = Object.values(layout);
  const nodeDuration = duration / (nodesList.length || 1);
  const activeNodeIndex = nodesList.length > 0
    ? Math.min(Math.floor(currentTime / nodeDuration), nodesList.length - 1)
    : -1;
  const activeNodeId = activeNodeIndex !== -1 ? nodesList[activeNodeIndex].id : null;

  return (
    <AbsoluteFill className="bg-[#070709] text-white font-sans overflow-hidden">
      {audioUrl && <Audio src={staticFile(audioUrl)} />}
      <ParticleField />

      <div
        style={{ transform: `scale(${camScale})`, transformOrigin: "center" }}
        className={`w-full h-full flex flex-col relative z-10 ${isPortrait ? "p-8" : "p-10"}`}
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <span className="text-xs font-mono tracking-widest text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
              README RADIO SHOWCASE
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight mt-2 bg-gradient-to-r from-white via-white to-purple-300 bg-clip-text text-transparent">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />
            <span className="font-mono text-sm text-white/40">
              {Math.floor(currentTime / 60)}:
              {String(Math.floor(currentTime % 60)).padStart(2, "0")} /{" "}
              {Math.floor(durationInFrames / fps / 60)}:
              {String(Math.floor((durationInFrames / fps) % 60)).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Panels */}
        <div className={`flex-1 min-h-0 grid gap-6 my-6 items-stretch ${isPortrait || isSquare ? "grid-cols-1 grid-rows-2" : "grid-cols-12"}`}>

          {/* Left: Dynamic Visual Flowchart */}
          <div className={`${isPortrait || isSquare ? "min-h-0" : "col-span-7"} bg-[#0b0b0e] border border-white/5 rounded-3xl p-6 flex flex-col shadow-2xl`}>
            <h3 className="text-sm font-semibold tracking-wider text-white/40 uppercase mb-3 shrink-0">
              Flowchart Architecture
            </h3>

            <div className="relative w-full flex-1 min-h-0 bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
              <svg
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 w-full h-full"
              >
                {connections.map((conn, idx) => {
                  const fromNode = layout[conn.from];
                  const toNode = layout[conn.to];
                  if (!fromNode || !toNode) return null;

                  const x1 = fromNode.x + CARD_W;
                  const y1 = fromNode.y + CARD_H / 2;
                  const x2 = toNode.x;
                  const y2 = toNode.y + CARD_H / 2;

                  const cx1 = x1 + 50;
                  const cy1 = y1;
                  const cx2 = x2 - 50;
                  const cy2 = y2;
                  const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

                  const connDuration = duration / (connections.length || 1);
                  const isActive = Math.floor(currentTime / connDuration) === idx;

                  return (
                    <g key={idx}>
                      <path d={pathD} fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth={2} />
                      <path
                        d={pathD}
                        fill="none"
                        stroke={isActive ? "#a78bfa" : "#c084fc"}
                        strokeWidth={2.5}
                        strokeDasharray={8}
                        style={{
                          strokeDashoffset: -frame * 0.4,
                          opacity: isActive ? 0.85 : 0.12,
                          filter: isActive ? "drop-shadow(0 0 4px rgba(167,139,250,0.8))" : "none",
                        }}
                      />
                    </g>
                  );
                })}

                {nodesList.map((node, i) => {
                  const isActive = node.id === activeNodeId;
                  const entrance = spring({ frame: frame - i * 2, fps, config: { damping: 12 } });
                  const glow = isActive ? 0.5 + Math.sin(frame * 0.15) * 0.25 : 0;
                  const translateY = interpolate(entrance, [0, 1], [16, 0]);

                  return (
                    <foreignObject key={node.id} x={node.x} y={node.y} width={CARD_W} height={CARD_H}>
                      <div
                        style={{
                          opacity: interpolate(entrance, [0, 1], [0, 1]),
                          transform: `scale(${entrance}) translateY(${translateY}px)`,
                          boxShadow: isActive ? `0 0 ${20 + glow * 20}px rgba(167,139,250,${glow})` : "none",
                        }}
                        className={`w-full h-full rounded-2xl border flex items-center p-4 ${
                          isActive
                            ? "bg-purple-500/10 border-purple-500"
                            : "bg-white/[0.01] border-white/5 opacity-30"
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden w-full">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold shrink-0 ${
                              isActive ? "bg-purple-500 text-white" : "bg-white/10 text-white/50"
                            }`}
                          >
                            {i + 1}
                          </div>
                          <span className="font-bold text-xs truncate text-white/95">{node.label}</span>
                        </div>
                      </div>
                    </foreignObject>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right: Captions Display */}
          <div className={`${isPortrait || isSquare ? "min-h-0" : "col-span-5"} bg-[#0b0b0e] border border-white/5 rounded-3xl p-8 flex flex-col justify-center relative overflow-hidden shadow-2xl`}>
            <div className="flex flex-col gap-6 justify-center h-full max-w-lg mx-auto">
              {prevCaption && (
                <p className="text-lg text-white/10 font-semibold line-clamp-2">{prevCaption.text}</p>
              )}

              <div className="py-2">
                {currentCaption ? (
                  <KineticText
                    text={currentCaption.text}
                    localFrame={captionLocalFrame}
                    fps={fps}
                    className={`${isPortrait ? "text-3xl" : "text-4xl"} font-extrabold leading-snug tracking-tight text-white`}
                  />
                ) : (
                  <p className="text-4xl font-extrabold text-white/20">...</p>
                )}
              </div>

              {nextCaption && (
                <p className="text-lg text-white/20 font-semibold line-clamp-2">{nextCaption.text}</p>
              )}
            </div>
          </div>
        </div>

        {/* Progress Timeline */}
        <div className="border-t border-white/5 pt-4 flex items-center gap-6 shrink-0">
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-600 to-purple-400"
              style={{ width: `${(frame / durationInFrames) * 100}%` }}
            />
          </div>
          <div className="flex gap-0.5 items-end h-8">
            {[...Array(24)].map((_, i) => {
              const height = interpolate(
                Math.sin(frame * 0.15 + i * 0.3) * Math.cos(frame * 0.08 + i * 0.15),
                [-1, 1],
                [4, 28]
              );
              return (
                <div
                  key={i}
                  className="w-1 bg-gradient-to-t from-purple-600/30 to-purple-400/70 rounded-full"
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <IntroScene title={title} introFrames={introFrames} fps={fps} />
      <OutroScene title={title} outroStart={outroStart} totalFrames={durationInFrames} fps={fps} />
    </AbsoluteFill>
  );
};
