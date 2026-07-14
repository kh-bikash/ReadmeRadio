import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { normalizeGitHubRepository, repositorySlug } from "../../../core/src/repository.js";
import type { GenerationJob, GenerationResult, GenerationSettings } from "./job-types";

interface InternalJob extends GenerationJob {
  outputDirectory: string;
  cacheKey: string;
  process?: ChildProcess;
  logTail: string;
}

interface JobState {
  jobs: Map<string, InternalJob>;
  queue: string[];
  events: EventEmitter;
  activeCount: number;
  requests: Map<string, number[]>;
}

declare global {
  var __readmeRadioJobs: JobState | undefined;
}

const state: JobState = globalThis.__readmeRadioJobs ?? {
  jobs: new Map(),
  queue: [],
  events: new EventEmitter(),
  activeCount: 0,
  requests: new Map(),
};
state.events.setMaxListeners(100);
globalThis.__readmeRadioJobs = state;

const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.README_RADIO_CONCURRENCY || 1));
const MAX_REQUESTS_PER_HOUR = Math.max(1, Number(process.env.README_RADIO_RATE_LIMIT || 6));
const CLI_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../cli");

function publicJob(job: InternalJob): GenerationJob {
  return structuredClone({
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    settings: job.settings,
    result: job.result,
    error: job.error,
  });
}

function emit(job: InternalJob) {
  job.updatedAt = new Date().toISOString();
  state.events.emit(job.id, publicJob(job));
}

function update(job: InternalJob, patch: Partial<GenerationJob>) {
  Object.assign(job, patch);
  emit(job);
}

function cacheKey(settings: GenerationSettings) {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex").slice(0, 20);
}

function appendLog(job: InternalJob, value: string) {
  job.logTail = `${job.logTail}${value}`.slice(-8000);
}

function parseProgress(job: InternalJob, line: string) {
  appendLog(job, `${line}\n`);
  try {
    const event = JSON.parse(line) as { type?: string; stage?: string; progress?: number; message?: string };
    if (event.type === "progress" && event.stage && typeof event.progress === "number" && event.message) {
      update(job, {
        stage: event.stage,
        progress: Math.min(100, Math.max(0, event.progress)),
        message: event.message,
      });
    }
  } catch {
    // Human-readable CLI output is retained in the capped diagnostic tail.
  }
}

async function readResult(job: InternalJob): Promise<GenerationResult> {
  const baseUrl = `/generated/${repositorySlug(job.settings.repository)}/${job.id}`;
  const [script, mermaid, captionsText, manifestText] = await Promise.all([
    fs.readFile(path.join(job.outputDirectory, "script.txt"), "utf8"),
    fs.readFile(path.join(job.outputDirectory, "architecture.mermaid"), "utf8"),
    fs.readFile(path.join(job.outputDirectory, "captions.json"), "utf8"),
    fs.readFile(path.join(job.outputDirectory, "manifest.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText) as { duration?: number };
  return {
    repoName: job.settings.repository,
    duration: Number(manifest.duration) || 0,
    videoUrl: `${baseUrl}/explainer.mp4`,
    audioUrl: `${baseUrl}/episode.wav`,
    captionsUrl: `${baseUrl}/captions.srt`,
    captionsVttUrl: `${baseUrl}/captions.vtt`,
    captionsJsonUrl: `${baseUrl}/captions.json`,
    scriptUrl: `${baseUrl}/script.txt`,
    mermaidUrl: `${baseUrl}/architecture.mermaid`,
    script,
    mermaid,
    captions: JSON.parse(captionsText),
  };
}

async function runJob(job: InternalJob) {
  state.activeCount += 1;
  update(job, { status: "running", stage: "starting", progress: 2, message: "Starting isolated generation worker" });

  const cliPath = path.join(CLI_DIRECTORY, "index.js");
  const args = [
    cliPath,
    job.settings.repository,
    "--engine", job.settings.engine,
    "--output-dir", job.outputDirectory,
    "--tone", job.settings.tone,
    "--target-minutes", String(job.settings.targetMinutes),
    "--aspect-ratio", job.settings.aspectRatio,
    "--json-progress",
  ];

  const child = spawn(process.execPath, args, {
    cwd: CLI_DIRECTORY,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  job.process = child;
  const stdout = readline.createInterface({ input: child.stdout });
  stdout.on("line", (line) => parseProgress(job, line));
  child.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));

  await new Promise<void>((resolve) => {
    child.on("error", (error) => {
      appendLog(job, error.message);
      resolve();
    });
    child.on("close", async (code) => {
      job.process = undefined;
      if (job.status === "cancelled") {
        resolve();
        return;
      }
      if (code !== 0) {
        const lastLine = job.logTail.trim().split(/\r?\n/).filter(Boolean).at(-1);
        update(job, { status: "failed", stage: "failed", progress: job.progress, message: "Generation failed", error: lastLine || "Generation worker exited unexpectedly" });
        await fs.rm(job.outputDirectory, { recursive: true, force: true }).catch(() => undefined);
        resolve();
        return;
      }
      try {
        const result = await readResult(job);
        update(job, { status: "completed", stage: "complete", progress: 100, message: "Explainer video is ready", result });
      } catch (error) {
        update(job, { status: "failed", stage: "failed", message: "Generated artifacts were incomplete", error: error instanceof Error ? error.message : "Could not read generated artifacts" });
      }
      resolve();
    });
  });

  if (job.status === "cancelled") {
    await fs.rm(job.outputDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
  state.activeCount -= 1;
  void pumpQueue();
}

async function pumpQueue() {
  while (state.activeCount < MAX_CONCURRENT_JOBS && state.queue.length > 0) {
    const id = state.queue.shift();
    const job = id ? state.jobs.get(id) : undefined;
    if (!job || job.status !== "queued") continue;
    void runJob(job);
  }
}

export function validateSettings(input: unknown): GenerationSettings {
  if (!input || typeof input !== "object") throw new Error("Generation settings are required");
  const value = input as Partial<GenerationSettings> & { repoUrl?: string };
  const repository = normalizeGitHubRepository(value.repository || value.repoUrl || "");
  const engine = value.engine || "remotion";
  const tone = value.tone || "friendly";
  const aspectRatio = value.aspectRatio || "16:9";
  const targetMinutes = Number(value.targetMinutes || 3);
  if (engine !== "remotion" && engine !== "hyperframes") throw new Error("Unsupported rendering engine");
  if (!["friendly", "technical", "cinematic", "concise"].includes(tone)) throw new Error("Unsupported narration tone");
  if (!["16:9", "1:1", "9:16"].includes(aspectRatio)) throw new Error("Unsupported aspect ratio");
  if (!Number.isInteger(targetMinutes) || targetMinutes < 1 || targetMinutes > 5) throw new Error("Duration must be between 1 and 5 minutes");
  return { repository, engine, tone, aspectRatio, targetMinutes };
}

export async function createJob(settings: GenerationSettings): Promise<GenerationJob> {
  const key = cacheKey(settings);
  const cached = [...state.jobs.values()].find((job) => job.cacheKey === key && !["failed", "cancelled"].includes(job.status));
  if (cached) return publicJob(cached);

  const id = randomUUID();
  const now = new Date().toISOString();
  const outputDirectory = path.join(process.cwd(), "public", "generated", repositorySlug(settings.repository), id);
  await fs.mkdir(outputDirectory, { recursive: true });
  const job: InternalJob = {
    id,
    status: "queued",
    stage: "queued",
    progress: 0,
    message: "Waiting for an available generation worker",
    createdAt: now,
    updatedAt: now,
    settings,
    outputDirectory,
    cacheKey: key,
    logTail: "",
  };
  state.jobs.set(id, job);
  state.queue.push(id);
  emit(job);
  queueMicrotask(() => void pumpQueue());
  return publicJob(job);
}

export function getJob(id: string): GenerationJob | undefined {
  const job = state.jobs.get(id);
  return job ? publicJob(job) : undefined;
}

export async function cancelJob(id: string): Promise<GenerationJob | undefined> {
  const job = state.jobs.get(id);
  if (!job) return undefined;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return publicJob(job);
  update(job, { status: "cancelled", stage: "cancelled", message: "Generation cancelled" });
  if (job.process && !job.process.killed) {
    if (process.platform === "win32" && job.process.pid) {
      spawn("taskkill", ["/PID", String(job.process.pid), "/T", "/F"], { shell: false, windowsHide: true });
    } else {
      job.process.kill("SIGTERM");
    }
  }
  state.queue = state.queue.filter((queuedId) => queuedId !== id);
  await fs.rm(job.outputDirectory, { recursive: true, force: true }).catch(() => undefined);
  return publicJob(job);
}

export function subscribeToJob(id: string, listener: (job: GenerationJob) => void) {
  state.events.on(id, listener);
  return () => {
    state.events.off(id, listener);
  };
}

export function checkRateLimit(key: string) {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const requests = (state.requests.get(key) || []).filter((time) => time > cutoff);
  if (requests.length >= MAX_REQUESTS_PER_HOUR) return false;
  requests.push(now);
  state.requests.set(key, requests);
  return true;
}

export function hasValidApiToken(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
  if (fetchSite === "cross-site") return false;
  const expected = process.env.README_RADIO_API_TOKEN;
  if (!expected) return true;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
