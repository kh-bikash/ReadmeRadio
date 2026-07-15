export type BeatKind = "hook" | "concept" | "how_it_works" | "comparison" | "key_term" | "recap";

export interface RawBeat {
  id: string;
  kind: BeatKind;
  title: string;
  narration: string;
  nodeIds?: string[];
  comparison?: { leftLabel: string; leftItems: string[]; rightLabel: string; rightItems: string[] };
  keyTerm?: { term: string; definition: string };
}

export interface BeatAssignment extends RawBeat {
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
  matched: boolean;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export function alignBeatsToWords(
  beats: RawBeat[],
  words: WordTiming[],
  fps: number,
  duration: number,
): BeatAssignment[];

export function synthesizeFallbackBeats(
  captionsJson: CaptionCue[],
  nodes: { id: string; label: string }[],
  readmeData: unknown,
  fps?: number,
): BeatAssignment[];
