import type { CaptionItem } from "../Root";
import type { BeatAssignment, BeatKind } from "../../../core/src/beats.js";
import { tokenize } from "../../../core/src/textMatch.js";

export type { BeatAssignment, BeatKind };

export type SceneType = "topic" | "features" | "code" | "concept" | "diagram" | "flow" | "comparison" | "key_term";

export interface SceneAssignment {
  type: SceneType;
  startFrame: number;
  endFrame: number;
  start: number;
  end: number;
  title: string;
  narration: string;
  nodeIds?: string[];
  comparison?: { leftLabel: string; leftItems: string[]; rightLabel: string; rightItems: string[] };
  keyTerm?: { term: string; definition: string };
  isRecap?: boolean;
  contentIndex: number;
}

const KIND_TO_TYPE: Record<BeatKind, SceneType> = {
  hook: "topic",
  concept: "concept",
  how_it_works: "diagram",
  comparison: "comparison",
  key_term: "key_term",
  recap: "concept",
};

// Turns the LLM-authored (or fallback-synthesized) beat plan into scenes.
// This is a straight 1:1 mapping — beats already carry real audio-accurate
// timing, kind, and content, so there is no keyword-guessing or rotation
// logic left to do here (see the legacy scheduleScenes below for the old
// approach, kept only for input-props.json files that predate beats).
export function scheduleFromBeats(beats: BeatAssignment[]): SceneAssignment[] {
  if (!beats || beats.length === 0) return [];

  return beats.map((b) => {
    let type = KIND_TO_TYPE[b.kind] ?? "concept";
    if (type === "diagram" && (b.nodeIds?.length ?? 0) <= 1) type = "flow";

    return {
      type,
      startFrame: b.startFrame,
      endFrame: b.endFrame,
      start: b.start,
      end: b.end,
      title: b.title,
      narration: b.narration,
      nodeIds: b.nodeIds,
      comparison: b.comparison,
      keyTerm: b.keyTerm,
      isRecap: b.kind === "recap",
      contentIndex: 0,
    };
  });
}

const CODE_HINT_WORDS = new Set(["code", "example", "usage", "install", "command", "import", "pip", "npm", "run", "terminal", "shell", "function", "snippet"]);
const FEATURE_HINT_WORDS = new Set(["feature", "offers", "supports", "provides", "includes", "flexible", "capabilities", "capability"]);

// Opportunistically retypes a "concept" scene to "features"/"code" when its
// narration textually overlaps real README content — keeps those scene types
// content-accurate to what's actually being said, instead of a separate
// BeatKind the LLM would have to remember to use.
export function assignContentScenes(
  scenes: SceneAssignment[],
  readmeData?: { features?: string[]; codeBlocks?: { lang: string; code: string }[] },
): SceneAssignment[] {
  const features = readmeData?.features ?? [];
  const codeBlocks = readmeData?.codeBlocks ?? [];
  let codeIndex = 0;
  let usedFeatures = false;

  return scenes.map((scene) => {
    if (scene.type !== "concept") return scene;
    const tokens = tokenize(scene.narration);

    if (codeBlocks.length > 0 && codeIndex < codeBlocks.length && tokens.some((t) => CODE_HINT_WORDS.has(t))) {
      const retyped: SceneAssignment = { ...scene, type: "code", contentIndex: codeIndex };
      codeIndex++;
      return retyped;
    }
    if (features.length > 0 && !usedFeatures && tokens.some((t) => FEATURE_HINT_WORDS.has(t))) {
      usedFeatures = true;
      return { ...scene, type: "features" };
    }
    return scene;
  });
}

// --- Legacy keyword-based scheduler -----------------------------------
// Kept only as a fallback for input-props.json files generated before beats
// existed. Comparison/key_term require real authored content that this path
// never has, so it never emits those two scene types — everything that isn't
// features/code/diagram/flow falls back to "concept".

const LEGACY_KEYWORDS: Record<string, string[]> = {
  features: ["feature", "offers", "supports", "provides", "includes", "comes with", "flexible", "composable", "nesting", "automatically"],
  code: ["code", "example", "usage", "install", "command", "import", "pip", "npm", "run", "terminal", "shell", "function", "decorator", "@click"],
  diagram: ["architect", "how it works", "flow", "diagram", "system", "pipeline", "process", "component", "service", "connect", "data flow", "under the hood", "behind", "calls"],
  flow: ["step", "first", "then", "next", "finally", "process", "sequence", "order", "workflow", "stage"],
};

const LEGACY_ROTATION: SceneType[] = ["features", "diagram", "code", "flow", "concept"];

function legacyDetectSceneType(text: string, available: Set<SceneType>): SceneType {
  const lower = text.toLowerCase();
  const scores: { type: SceneType; score: number }[] = [];
  for (const [type, words] of Object.entries(LEGACY_KEYWORDS) as [SceneType, string[]][]) {
    if (!available.has(type)) continue;
    const score = words.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
    scores.push({ type, score });
  }
  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 0 && scores[0].score > 0) return scores[0].type;
  return "concept";
}

export function scheduleScenes(
  captions: CaptionItem[],
  fps: number,
  duration: number,
  hasFeatures: boolean = true,
  hasCode: boolean = true,
): SceneAssignment[] {
  if (captions.length === 0) return [];

  const available = new Set<SceneType>(["diagram", "flow", "concept"]);
  if (hasFeatures) available.add("features");
  if (hasCode) available.add("code");

  const sentences: { start: number; end: number; text: string; firstSentence: string }[] = [];
  let currentSeg: { start: number; end: number; text: string } | null = null;

  for (const cap of captions) {
    if (!currentSeg) {
      currentSeg = { start: cap.start, end: cap.end, text: cap.text };
    } else {
      currentSeg.end = cap.end;
      currentSeg.text += " " + cap.text;
    }
    if (/[.!?]$/.test(cap.text.trim())) {
      const firstSentence = currentSeg.text.split(/[.!?]/)[0].trim();
      sentences.push({ ...currentSeg, firstSentence });
      currentSeg = null;
    }
  }
  if (currentSeg) {
    sentences.push({ ...currentSeg, firstSentence: currentSeg.text.split(/[.!?]/)[0].trim() });
  }

  const minDur = 7;
  const grouped: { start: number; end: number; text: string; detectText: string }[] = [];
  let currentGroup: { start: number; end: number; text: string; detectText: string } | null = null;

  for (const sent of sentences) {
    if (!currentGroup) {
      currentGroup = { start: sent.start, end: sent.end, text: sent.text, detectText: sent.firstSentence };
    } else if (sent.end - currentGroup.start < minDur) {
      currentGroup.end = sent.end;
      currentGroup.text += " " + sent.text;
    } else {
      grouped.push(currentGroup);
      currentGroup = { start: sent.start, end: sent.end, text: sent.text, detectText: sent.firstSentence };
    }
  }
  if (currentGroup) grouped.push(currentGroup);

  const finalScenes: typeof grouped = [];
  for (const grp of grouped) {
    const last = finalScenes[finalScenes.length - 1];
    if (last && grp.end - last.start < minDur) {
      last.end = grp.end;
      last.text += " " + grp.text;
    } else {
      finalScenes.push({ ...grp });
    }
  }

  const assignments: SceneAssignment[] = [];
  const recent: SceneType[] = [];
  const contentCounters: Record<string, number> = { code: 0, features: 0 };
  let rotIdx = 0;

  for (let i = 0; i < finalScenes.length; i++) {
    const scene = finalScenes[i];
    let type: SceneType;

    if (i === 0) {
      type = "topic";
    } else {
      type = legacyDetectSceneType(scene.detectText, available);

      if (recent.includes(type)) {
        for (let j = 0; j < LEGACY_ROTATION.length; j++) {
          const candidate = LEGACY_ROTATION[(rotIdx + j) % LEGACY_ROTATION.length];
          if (available.has(candidate) && !recent.includes(candidate)) {
            type = candidate;
            rotIdx = (rotIdx + j + 1) % LEGACY_ROTATION.length;
            break;
          }
        }
      }
      if (recent.includes(type)) {
        for (const candidate of available) {
          if (!recent.includes(candidate)) { type = candidate; break; }
        }
      }
    }

    let contentIndex = 0;
    if (type === "code") { contentIndex = contentCounters.code; contentCounters.code++; }
    else if (type === "features") { contentIndex = contentCounters.features; contentCounters.features++; }

    const titleWords = scene.detectText.trim().split(/\s+/).slice(0, 5).join(" ");
    const title = titleWords.replace(/[.!?]$/, "");

    assignments.push({
      type,
      startFrame: Math.round(scene.start * fps),
      endFrame: Math.round(scene.end * fps),
      start: scene.start,
      end: scene.end,
      title,
      narration: scene.text,
      contentIndex,
    });

    recent.push(type);
    if (recent.length > 3) recent.shift();
  }

  if (assignments.length > 0) {
    assignments[0].startFrame = 0;
    assignments[0].start = 0;

    // Scenes must tile the timeline with zero gaps — captions have small
    // natural pauses between them, and a gap here means no scene covers that
    // frame range at all (renders as a blank flicker between scenes).
    for (let i = 0; i < assignments.length - 1; i++) {
      assignments[i].end = assignments[i + 1].start;
      assignments[i].endFrame = assignments[i + 1].startFrame;
    }

    const last = assignments[assignments.length - 1];
    last.endFrame = Math.round(duration * fps);
    last.end = duration;
  }

  return assignments;
}
