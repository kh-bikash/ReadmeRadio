export type RenderEngine = "remotion" | "hyperframes";
export type NarrationTone = "friendly" | "technical" | "cinematic" | "concise";
export type AspectRatio = "16:9" | "1:1" | "9:16";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface GenerationSettings {
  repository: string;
  engine: RenderEngine;
  tone: NarrationTone;
  targetMinutes: number;
  aspectRatio: AspectRatio;
}

export interface CaptionItem {
  index?: number;
  start: number;
  end: number;
  text: string;
}

export interface GenerationResult {
  repoName: string;
  duration: number;
  videoUrl: string;
  audioUrl: string;
  captionsUrl: string;
  captionsVttUrl: string;
  captionsJsonUrl: string;
  scriptUrl: string;
  mermaidUrl: string;
  script: string;
  mermaid: string;
  captions: CaptionItem[];
}

export interface GenerationJob {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  settings: GenerationSettings;
  result?: GenerationResult;
  error?: string;
}
