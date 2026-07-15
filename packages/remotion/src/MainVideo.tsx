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
import { theme } from "./theme";
import { Atmosphere } from "./components/Atmosphere";
import { ChapterLowerThird } from "./components/ChapterLowerThird";
import { SubtitleBar } from "./components/SubtitleBar";
import { FeatureCardsScene } from "./components/FeatureCardsScene";
import { CodeScene } from "./components/CodeScene";
import { KeyPointScene } from "./components/KeyPointScene";
import { TopicCardScene } from "./components/TopicCardScene";
import { FlythroughDiagram } from "./components/FlythroughDiagram";
import { FlowScene } from "./components/FlowScene";
import { ComparisonScene } from "./components/ComparisonScene";
import { AnnotationScene } from "./components/AnnotationScene";
import {
  scheduleScenes,
  scheduleFromBeats,
  assignContentScenes,
  type SceneAssignment,
  type BeatAssignment,
} from "./components/sceneScheduler";

export interface NodeLayoutItem { id: string; label: string; x: number; y: number; col: number; row: number; }
export interface ConnectionItem { from: string; to: string; label?: string; }
export interface WordTiming { word: string; start: number; end: number; }
export interface ReadmeData {
  features: string[];
  codeBlocks: { lang: string; code: string }[];
  headers: string[];
  description: string;
}
export interface AdvancedMainVideoProps {
  [key: string]: unknown;
  title: string; script: string; captions: CaptionItem[];
  words?: WordTiming[]; cueTimes?: Record<string, number>;
  beats?: BeatAssignment[];
  readmeData?: ReadmeData; mermaidCode: string;
  duration: number;
  layout?: Record<string, NodeLayoutItem>;
  connections?: ConnectionItem[];
  audioUrl: string;
  aspectRatio?: "16:9" | "1:1" | "9:16";
}

const NODE_ACTIVE_WINDOW = 4;

// Legacy fallback: derives lower-third chapters from arbitrary caption
// sentences, used only when there's no beat-driven scene schedule to draw
// chapter titles from.
function deriveChaptersFromCaptions(captions: CaptionItem[]) {
  if (captions.length === 0) return [];
  const ends = captions.filter((c) => /[.!?]$/.test(c.text.trim()));
  const step = Math.max(1, Math.floor(ends.length / 5));
  return ends.filter((_, i) => i % step === 0).slice(0, 5).map((c) => ({
    label: c.text.trim().split(/\s+/).slice(0, 4).join(" ").replace(/[.!?]$/, ""),
    at: c.start,
  }));
}

// Chapters drawn from the authored scene structure — the titles were written
// with intent, so they read better as lower-thirds than arbitrary sentences.
function deriveChaptersFromScenes(scenes: SceneAssignment[]) {
  if (scenes.length === 0) return [];
  const notable = scenes.filter((s) => s.type !== "concept" && s.title);
  const source = notable.length >= 2 ? notable : scenes;
  const step = Math.max(1, Math.floor(source.length / 5));
  return source.filter((_, i) => i % step === 0).slice(0, 5).map((s) => ({ label: s.title, at: s.start }));
}

function IntroScene({ title, introFrames, fps }: { title: string; introFrames: number; fps: number }) {
  const frame = useCurrentFrame();
  if (frame > introFrames) return null;
  const outStart = introFrames - 18;
  const inSpring = spring({ frame, fps, config: theme.spring.gentle });
  const scale = interpolate(inSpring, [0, 1], [0.88, 1]);
  const opacityIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const opacityOut = interpolate(frame, [outStart, introFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const opacity = Math.min(opacityIn, opacityOut);
  const exitScale = interpolate(frame, [outStart, introFrames], [1, 1.06], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 0.88 + Math.sin(frame * 0.18) * 0.12;

  return (
    <AbsoluteFill style={{ opacity, zIndex: 50 }} className="items-center justify-center">
      <Atmosphere variant="night" intensity={1.3} />
      <div style={{ transform: `scale(${scale * exitScale})`, zIndex: 1 }} className="flex flex-col items-center gap-6">
        <div style={{ transform: `scale(${pulse})` }} className="w-20 h-20 rounded-full flex items-center justify-center">
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: theme.onPrimary, boxShadow: `0 0 50px rgba(255,255,255,0.4)` }} />
        </div>
        <span style={{ ...theme.type.eyebrow, color: "rgba(255,255,255,0.6)", letterSpacing: "0.3em" }}>README RADIO</span>
        <h1 style={{ ...theme.type.display2, color: theme.onPrimary, textAlign: "center", padding: "0 48px", maxWidth: "82%" }}>{title}</h1>
      </div>
    </AbsoluteFill>
  );
}

function OutroScene({ title, outroStart, totalFrames, fps }: { title: string; outroStart: number; totalFrames: number; fps: number }) {
  const frame = useCurrentFrame();
  if (frame < outroStart) return null;
  const local = frame - outroStart;
  const s = spring({ frame: local, fps, config: theme.spring.gentle });
  const scale = interpolate(s, [0, 1], [0.92, 1]);
  const opacity = interpolate(local, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [totalFrames - 12, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ zIndex: 50, opacity: fadeOut }} className="items-center justify-center">
      <Atmosphere variant="night" intensity={1.1} />
      <div style={{ transform: `scale(${scale})`, zIndex: 1, opacity }} className="flex flex-col items-center gap-5">
        <div style={{ transform: `rotate(${frame * 1.0}deg)`, fontSize: 32, color: "rgba(255,255,255,0.7)" }}>✦</div>
        <h2 style={{ ...theme.type.heading2, color: "rgba(255,255,255,0.9)" }}>Thanks for tuning in</h2>
        <p style={{ ...theme.type.bodyMd, color: "rgba(255,255,255,0.5)" }}>{title}</p>
        <span style={{ ...theme.type.eyebrow, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginTop: 8, letterSpacing: "0.15em" }}>Generated by README Radio</span>
      </div>
    </AbsoluteFill>
  );
}

function SceneRenderer({
  scene, layout, connections, cueTimes, duration, currentTime, activeNodeId,
  features, codeBlocks, description, captions, nodesList,
}: {
  scene: SceneAssignment;
  layout: Record<string, NodeLayoutItem>;
  connections: ConnectionItem[];
  cueTimes: Record<string, number>;
  duration: number;
  currentTime: number;
  activeNodeId: string | null;
  features: string[];
  codeBlocks: { lang: string; code: string }[];
  description: string;
  captions: CaptionItem[];
  nodesList: NodeLayoutItem[];
}): React.ReactNode {
  const codeBlock = codeBlocks.length > 0 ? codeBlocks[scene.contentIndex % codeBlocks.length] : null;

  switch (scene.type) {
    case "topic":
      return <TopicCardScene title={scene.title} subtitle={description} startFrame={scene.startFrame} endFrame={scene.endFrame} />;
    case "features":
      return features.length > 0 ? <FeatureCardsScene features={features} title="What it does" startFrame={scene.startFrame} endFrame={scene.endFrame} /> : null;
    case "code":
      return codeBlock ? <CodeScene code={codeBlock.code} lang={codeBlock.lang} title="Code Example" startFrame={scene.startFrame} endFrame={scene.endFrame} /> : null;
    case "concept":
      return (
        <KeyPointScene
          text={scene.narration.split(/[.!?]/)[0]}
          title={scene.title || (scene.isRecap ? "Recap" : "Key idea")}
          startFrame={scene.startFrame}
          endFrame={scene.endFrame}
        />
      );
    case "diagram": {
      // Prefer the active node this specific beat is actually about; fall back
      // to the global cue scan only when the beat didn't name a real node.
      const beatActiveId = scene.nodeIds?.find((id) => layout[id]) ?? activeNodeId;
      return Object.keys(layout).length > 0 ? (
        <FlythroughDiagram
          layout={layout} connections={connections} cueTimes={cueTimes} duration={duration}
          currentTime={currentTime} activeNodeId={beatActiveId} captions={captions}
          focusNodeIds={scene.nodeIds} sceneStartFrame={scene.startFrame} sceneEndFrame={scene.endFrame}
        />
      ) : null;
    }
    case "flow":
      return <FlowScene nodes={nodesList} cueTimes={cueTimes} currentTime={currentTime} startFrame={scene.startFrame} endFrame={scene.endFrame} />;
    case "comparison":
      return scene.comparison ? (
        <ComparisonScene
          title={scene.title || "Why it matters"}
          leftLabel={scene.comparison.leftLabel}
          leftItems={scene.comparison.leftItems}
          rightLabel={scene.comparison.rightLabel}
          rightItems={scene.comparison.rightItems}
          startFrame={scene.startFrame}
          endFrame={scene.endFrame}
        />
      ) : null;
    case "key_term":
      return scene.keyTerm ? (
        <AnnotationScene
          title={scene.title || "Key term"}
          terms={[{ word: scene.keyTerm.term, definition: scene.keyTerm.definition }]}
          startFrame={scene.startFrame}
          endFrame={scene.endFrame}
        />
      ) : null;
    default:
      return null;
  }
}

export const MainVideo: React.FC<AdvancedMainVideoProps> = ({
  title, captions = [], words = [], cueTimes = {}, beats, readmeData,
  duration = 60, layout = {}, connections = [], audioUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const currentTime = frame / fps;
  const isPortrait = height > width;

  const introFrames = Math.min(60, Math.floor(durationInFrames * 0.12));
  const outroFrames = Math.min(60, Math.floor(durationInFrames * 0.12));
  const outroStart = durationInFrames - outroFrames;

  const features = readmeData?.features ?? [];
  const codeBlocks = readmeData?.codeBlocks ?? [];
  const description = readmeData?.description ?? "";

  // Beats carry real audio-accurate timing and authored content — use them
  // directly when present. Older input-props.json files without a beats
  // array still render via the legacy keyword-guessing scheduler.
  const sceneSchedule = beats && beats.length > 0
    ? assignContentScenes(scheduleFromBeats(beats), readmeData)
    : scheduleScenes(captions, fps, duration, features.length > 0, codeBlocks.length > 0);

  const chapters = beats && beats.length > 0
    ? deriveChaptersFromScenes(sceneSchedule)
    : deriveChaptersFromCaptions(captions);

  const nodesList = Object.values(layout);

  const activeNodeId = (() => {
    let active: string | null = null;
    for (const node of nodesList) {
      const cue = cueTimes[node.id] ?? 0;
      if (currentTime >= cue && currentTime <= cue + NODE_ACTIVE_WINDOW) active = node.id;
    }
    if (active) return active;
    const lastMentioned = nodesList
      .filter((n) => (cueTimes[n.id] ?? Infinity) <= currentTime)
      .sort((a, b) => (cueTimes[b.id] ?? 0) - (cueTimes[a.id] ?? 0))[0];
    return lastMentioned?.id ?? nodesList[0]?.id ?? null;
  })();

  const diagramActive = frame > introFrames && frame < outroStart;

  // Each scene already fades in/out on its own via useSceneFrame — a scene
  // component gates on its own `local >= 0` and returns null before its own
  // startFrame, so pre-rendering the *next* scene during an outer crossfade
  // window (before that scene's own startFrame) always renders nothing.
  // That made every transition fade to blank and then pop in abruptly, so
  // scenes are switched cleanly at their boundary and rely on their own
  // built-in enter/exit fade instead of a redundant (and broken) crossfade.
  const currentScene = sceneSchedule.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? null;

  const showDiagram = layout && Object.keys(layout).length > 0;

  const sceneProps = {
    layout, connections, cueTimes, duration, currentTime, activeNodeId,
    features, codeBlocks, description, captions, nodesList,
  };

  return (
    <AbsoluteFill className="overflow-hidden" style={{ background: theme.canvas, color: theme.ink, fontFamily: theme.type.bodyMd.fontFamily }}>
      {audioUrl && <Audio src={staticFile(audioUrl)} />}
      <Atmosphere />

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: isPortrait ? "16px 20px" : "20px 32px", zIndex: 10 }}>
        {/* Header — minimal, no timecode */}
        <div className="flex justify-between items-center shrink-0" style={{ paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...theme.type.eyebrow, color: theme.primary, background: theme.surface, padding: "4px 10px", borderRadius: theme.rounded.full, border: `1px solid ${theme.hairline}` }}>README RADIO</span>
            <h1 style={{ ...theme.type.heading3, color: theme.ink }}>{title}</h1>
          </div>
        </div>

        {/* Scene area — full remaining space, no bottom bar */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", borderRadius: theme.rounded.lg, background: theme.surface, border: `1px solid ${theme.hairline}` }}>
          {diagramActive && currentScene && (
            <div style={{ position: "absolute", inset: 0 }}>
              {SceneRenderer({ scene: currentScene, ...sceneProps })}
            </div>
          )}
          {diagramActive && !currentScene && showDiagram && (
            <FlythroughDiagram layout={layout} connections={connections} cueTimes={cueTimes} duration={duration} currentTime={currentTime} activeNodeId={activeNodeId} captions={captions} />
          )}
        </div>
      </div>

      {/* Subtitle bar — more room now since no bottom bar */}
      {words.length > 0 && frame > introFrames && frame < outroStart && (
        <SubtitleBar words={words} captions={captions} />
      )}

      {chapters.map((ch, i) => (
        <ChapterLowerThird key={i} index={i + 1} label={ch.label} startFrame={Math.round(ch.at * fps)} />
      ))}

      <IntroScene title={title} introFrames={introFrames} fps={fps} />
      <OutroScene title={title} outroStart={outroStart} totalFrames={durationInFrames} fps={fps} />
    </AbsoluteFill>
  );
};
