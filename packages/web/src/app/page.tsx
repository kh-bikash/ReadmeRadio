"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateLayout, deriveNodeCueTimes, parseMermaid } from "../../../core/src/diagram.js";
import type { GenerationJob, GenerationResult, GenerationSettings } from "@/lib/job-types";

const HISTORY_KEY = "readme-radio-history-v2";
const STAGES = [
  { id: "fetching", label: "Repository" },
  { id: "scripting", label: "Script" },
  { id: "audio", label: "Voice" },
  { id: "captions", label: "Captions" },
  { id: "rendering", label: "Video" },
];

const DEFAULT_SETTINGS: GenerationSettings = {
  repository: "",
  engine: "remotion",
  tone: "friendly",
  targetMinutes: 3,
  aspectRatio: "16:9",
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getRepositoryLabel(repository: string) {
  const value = repository.replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  return value || "owner/repository";
}

function ActionLink({ href, label, download }: { href: string; label: string; download?: boolean }) {
  return (
    <a
      href={href}
      download={download}
      target={download ? undefined : "_blank"}
      rel={download ? undefined : "noreferrer"}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-purple-400/40 hover:bg-purple-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      {label}
    </a>
  );
}

function Pipeline({ job }: { job: GenerationJob }) {
  const stageIndex = STAGES.findIndex((stage) => stage.id === job.stage);
  return (
    <div className="space-y-4" aria-label="Generation pipeline">
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.18em] text-white/50">
        <span>{job.message}</span>
        <span>{Math.round(job.progress)}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress)}
        aria-label="Generation progress"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-300 transition-[width] duration-500" style={{ width: `${job.progress}%` }} />
      </div>
      <ol className="grid grid-cols-5 gap-2">
        {STAGES.map((stage, index) => {
          const complete = job.status === "completed" || index < stageIndex;
          const active = stage.id === job.stage;
          return (
            <li key={stage.id} className={`rounded-lg border px-2 py-2 text-center text-[10px] font-mono uppercase tracking-wide ${active ? "border-purple-400/50 bg-purple-400/10 text-purple-200" : complete ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200/70" : "border-white/[0.06] text-white/30"}`}>
              {stage.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ArchitectureDiagram({ result, currentTime, onSeek }: { result: GenerationResult; currentTime: number; onSeek: (time: number) => void }) {
  const parsed = useMemo(() => parseMermaid(result.mermaid), [result.mermaid]);
  const layout = useMemo(() => calculateLayout(parsed.nodes, parsed.connections, { width: 640, height: 360, cardWidth: 150, cardHeight: 58, padding: 24 }), [parsed]);
  const cues = useMemo(() => deriveNodeCueTimes(parsed.nodes, result.captions, result.duration), [parsed.nodes, result.captions, result.duration]);
  const activeNode = useMemo(() => {
    return [...parsed.nodes]
      .sort((a, b) => cues[a.id] - cues[b.id])
      .filter((node) => cues[node.id] <= currentTime + 0.25)
      .at(-1)?.id ?? parsed.nodes[0]?.id;
  }, [cues, currentTime, parsed.nodes]);

  if (parsed.nodes.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-white/40">No architecture nodes were detected.</div>;
  }

  return (
    <svg viewBox="0 0 640 360" className="h-full w-full" aria-label="Interactive repository architecture">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {parsed.connections.map((connection) => {
        const from = layout[connection.from];
        const to = layout[connection.to];
        if (!from || !to) return null;
        const x1 = from.x + 150;
        const y1 = from.y + 29;
        const x2 = to.x;
        const y2 = to.y + 29;
        const path = `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 - 34} ${y2}, ${x2} ${y2}`;
        const active = connection.from === activeNode || connection.to === activeNode;
        return <path key={`${connection.from}-${connection.to}`} d={path} fill="none" stroke={active ? "#a78bfa" : "rgba(255,255,255,.12)"} strokeWidth={active ? 2.5 : 1.5} strokeDasharray={active ? "7 5" : undefined} markerEnd="url(#arrow)" style={{ color: active ? "#a78bfa" : "rgba(255,255,255,.18)" }} vectorEffect="non-scaling-stroke" />;
      })}
      {Object.values(layout).map((node, index) => {
        const active = node.id === activeNode;
        return (
          <foreignObject key={node.id} x={node.x} y={node.y} width="150" height="58">
            <button
              type="button"
              onClick={() => onSeek(cues[node.id] || 0)}
              aria-label={`Seek to ${node.label} at ${formatTime(cues[node.id] || 0)}`}
              aria-current={active ? "step" : undefined}
              className={`flex h-full w-full items-center gap-2 rounded-xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${active ? "border-purple-400 bg-purple-500/20 text-white shadow-[0_0_22px_rgba(167,139,250,.2)]" : "border-white/10 bg-[#111116] text-white/55 hover:border-purple-400/40 hover:text-white"}`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold ${active ? "bg-purple-500" : "bg-white/10"}`}>{index + 1}</span>
              <span className="line-clamp-2 text-[11px] font-bold leading-tight">{node.label}</span>
            </button>
          </foreignObject>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [history, setHistory] = useState<GenerationJob[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<"transcript" | "script">("transcript");
  const [editableScript, setEditableScript] = useState("");
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const result = job?.result;
  const generating = job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as GenerationJob[];
      setHistory(stored.filter((item) => item.status === "completed" && item.result).slice(0, 5));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  const saveCompletedJob = useCallback((completedJob: GenerationJob) => {
    setHistory((previous) => {
      const next = [completedJob, ...previous.filter((item) => item.id !== completedJob.id)].slice(0, 5);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const watchJob = useCallback((id: string) => {
    eventSourceRef.current?.close();
    const source = new EventSource(`/api/jobs/${id}/events`);
    eventSourceRef.current = source;
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as GenerationJob;
      setJob(next);
      if (next.result) setEditableScript(next.result.script);
      if (next.status === "completed") saveCompletedJob(next);
      if (["completed", "failed", "cancelled"].includes(next.status)) source.close();
    };
    source.onerror = async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { job: GenerationJob };
        setJob(data.job);
        if (data.job.result) setEditableScript(data.job.result.script);
        if (["completed", "failed", "cancelled"].includes(data.job.status)) source.close();
      } catch {
        // EventSource reconnects automatically while the job is still running.
      }
    };
  }, [saveCompletedJob]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    eventSourceRef.current?.close();
    setCurrentTime(0);
    setCopied(false);
    setJob({
      id: "pending",
      status: "queued",
      stage: "queued",
      progress: 0,
      message: "Submitting generation job",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings,
    });
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json() as { job?: GenerationJob; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error || "Could not create generation job");
      setJob(data.job);
      if (data.job.status === "completed" && data.job.result) {
        setEditableScript(data.job.result.script);
        saveCompletedJob(data.job);
      } else {
        watchJob(data.job.id);
      }
    } catch (error) {
      setJob((current) => current ? { ...current, status: "failed", stage: "failed", message: "Could not start generation", error: error instanceof Error ? error.message : "Generation request failed" } : current);
    }
  };

  const handleCancel = async () => {
    if (!job || job.id === "pending") return;
    const response = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (response.ok) {
      const data = await response.json() as { job: GenerationJob };
      setJob(data.job);
      eventSourceRef.current?.close();
    }
  };

  const seekVideo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
    void videoRef.current.play();
  };

  const activeCaptionIndex = result?.captions.findIndex((caption) => currentTime >= caption.start && currentTime <= caption.end) ?? -1;
  const videoAspect = settings.aspectRatio === "9:16" ? "aspect-[9/16] max-h-[620px]" : settings.aspectRatio === "1:1" ? "aspect-square" : "aspect-video";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070709] pb-20 text-white">
      <div className="pointer-events-none absolute -left-[20vw] -top-[20vw] h-[55vw] w-[55vw] rounded-full bg-purple-600/10 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-[20vw] -right-[20vw] h-[55vw] w-[55vw] rounded-full bg-blue-600/[0.08] blur-[150px]" />

      <header className="relative z-10 mx-auto max-w-7xl px-5 pb-10 pt-12 sm:px-8 sm:pt-20">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-400/[0.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-purple-300">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-300" /> Interactive explainer studio
        </div>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-5xl font-black tracking-[-0.055em] sm:text-7xl">README Radio<span className="text-purple-400">.</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">Turn a GitHub repository into a narrated, captioned architecture walkthrough—and explore every part of it on the timeline.</p>
          </div>
          {history.length > 0 && (
            <label className="flex min-w-64 flex-col gap-2 text-xs font-mono uppercase tracking-wider text-white/45">
              Recent explainers
              <select
                value=""
                onChange={(event) => {
                  const selected = history.find((item) => item.id === event.target.value);
                  if (selected) {
                    setJob(selected);
                    setSettings(selected.settings);
                    setEditableScript(selected.result?.script || "");
                  }
                }}
                className="min-h-11 rounded-xl border border-white/10 bg-[#101014] px-3 font-sans text-sm normal-case tracking-normal text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <option value="">Load a completed job…</option>
                {history.map((item) => <option key={item.id} value={item.id}>{item.settings.repository}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={handleGenerate} className="h-fit rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
          <div className="mb-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">01 / Configure</p>
            <h2 className="mt-2 text-xl font-bold">Build your explainer</h2>
          </div>

          <div className="space-y-6">
            <label htmlFor="repository" className="block text-xs font-semibold uppercase tracking-wider text-white/55">
              GitHub repository
              <input
                id="repository"
                type="text"
                inputMode="url"
                autoComplete="url"
                required
                value={settings.repository}
                onChange={(event) => setSettings((value) => ({ ...value, repository: event.target.value }))}
                placeholder="owner/repository"
                aria-describedby="repository-help"
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm font-normal normal-case tracking-normal text-white placeholder:text-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              />
              <span id="repository-help" className="mt-2 block text-[11px] font-normal normal-case tracking-normal text-white/35">Public GitHub repositories only.</span>
            </label>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-white/55">Rendering engine</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" role="radiogroup" aria-label="Rendering engine">
                {(["remotion", "hyperframes"] as const).map((engine) => (
                  <button key={engine} type="button" role="radio" aria-checked={settings.engine === engine} onClick={() => setSettings((value) => ({ ...value, engine }))} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${settings.engine === engine ? "border-purple-400/60 bg-purple-500/20 text-white" : "border-white/10 bg-black/25 text-white/45 hover:text-white"}`}>
                    {engine}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label htmlFor="tone" className="text-xs font-semibold uppercase tracking-wider text-white/55">
                Tone
                <select id="tone" value={settings.tone} onChange={(event) => setSettings((value) => ({ ...value, tone: event.target.value as GenerationSettings["tone"] }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#101014] px-3 text-sm font-normal normal-case tracking-normal text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                  <option value="friendly">Friendly</option><option value="technical">Technical</option><option value="cinematic">Cinematic</option><option value="concise">Concise</option>
                </select>
              </label>
              <label htmlFor="duration" className="text-xs font-semibold uppercase tracking-wider text-white/55">
                Duration
                <select id="duration" value={settings.targetMinutes} onChange={(event) => setSettings((value) => ({ ...value, targetMinutes: Number(event.target.value) }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#101014] px-3 text-sm font-normal normal-case tracking-normal text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                  {[1, 2, 3, 4, 5].map((minute) => <option key={minute} value={minute}>{minute} min</option>)}
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-white/55">Aspect ratio</legend>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Video aspect ratio">
                {(["16:9", "1:1", "9:16"] as const).map((ratio) => <button key={ratio} type="button" role="radio" aria-checked={settings.aspectRatio === ratio} onClick={() => setSettings((value) => ({ ...value, aspectRatio: ratio }))} className={`min-h-10 rounded-lg border text-xs font-mono transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${settings.aspectRatio === ratio ? "border-purple-400/50 bg-purple-400/15 text-purple-100" : "border-white/10 text-white/40"}`}>{ratio}</button>)}
              </div>
            </fieldset>

            <button type="submit" disabled={generating || !settings.repository.trim()} className="min-h-13 w-full rounded-xl bg-purple-600 px-4 font-bold text-white shadow-[0_12px_30px_rgba(124,58,237,.22)] transition hover:bg-purple-500 active:scale-[.99] disabled:cursor-not-allowed disabled:bg-purple-900/35 disabled:text-white/35 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
              {generating ? "Generating…" : result ? "Generate another version" : "Generate explainer"}
            </button>
          </div>

          {job && (
            <div className="mt-7 border-t border-white/[0.07] pt-6" aria-live="polite">
              <Pipeline job={job} />
              {generating && job.id !== "pending" && <button type="button" onClick={handleCancel} className="mt-4 min-h-10 w-full rounded-lg border border-red-400/20 text-xs font-semibold text-red-200/70 hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Cancel generation</button>}
              {job.status === "failed" && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-sm text-red-200"><p>{job.error || "Generation failed."}</p><button type="submit" className="mt-2 font-bold underline underline-offset-4">Retry</button></div>}
            </div>
          )}
        </form>

        <div className="min-w-0 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-2xl backdrop-blur-2xl sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">02 / Explore</p><h2 className="mt-2 text-xl font-bold">Interactive output</h2></div>
            {result && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-200">Ready · {formatTime(result.duration)}</span>}
          </div>

          {result ? (
            <div className="space-y-6">
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className={`mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl ${videoAspect}`}>
                  <video ref={videoRef} src={result.videoUrl} controls preload="metadata" onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} className="h-full w-full object-contain">
                    <track kind="captions" src={result.captionsVttUrl} srcLang="en" label="English" default />
                  </video>
                </div>
                <div className="min-h-80 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2 sm:p-4">
                  <div className="flex items-center justify-between px-2 pb-2"><h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-purple-300">Click a node to seek</h3><span className="font-mono text-[10px] text-white/35">{formatTime(currentTime)}</span></div>
                  <div className="h-[320px]"><ArchitectureDiagram result={result} currentTime={currentTime} onSeek={seekVideo} /></div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="flex flex-wrap gap-2">
                  <ActionLink href={result.videoUrl} label="Download MP4" download />
                  <ActionLink href={result.audioUrl} label="Audio" download />
                  <ActionLink href={result.captionsUrl} label="Captions" download />
                  <ActionLink href={result.mermaidUrl} label="Diagram" download />
                </div>
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(editableScript); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} className="min-h-11 rounded-xl border border-purple-400/20 bg-purple-400/[0.08] px-4 text-sm font-semibold text-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">{copied ? "Copied" : "Copy script"}</button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                <div className="flex border-b border-white/[0.07] p-2" role="tablist" aria-label="Generated content">
                  {(["transcript", "script"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${activeTab === tab ? "bg-white/[0.08] text-white" : "text-white/40"}`}>{tab}</button>)}
                </div>
                {activeTab === "transcript" ? (
                  <div role="tabpanel" className="max-h-72 overflow-y-auto p-3 sm:p-5">
                    {result.captions.map((caption, index) => <button key={`${caption.start}-${index}`} type="button" onClick={() => seekVideo(caption.start)} className={`flex w-full gap-4 rounded-lg px-3 py-2 text-left text-sm leading-6 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${index === activeCaptionIndex ? "bg-purple-400/15 text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"}`}><span className="w-10 shrink-0 font-mono text-[10px] text-purple-300/70">{formatTime(caption.start)}</span><span>{caption.text}</span></button>)}
                  </div>
                ) : (
                  <div role="tabpanel" className="p-3 sm:p-5">
                    <label htmlFor="script-editor" className="sr-only">Generated script</label>
                    <textarea id="script-editor" value={editableScript} onChange={(event) => setEditableScript(event.target.value)} className="min-h-64 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-7 text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400" />
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/35"><span>Edits are local until you export them.</span><button type="button" onClick={() => downloadText(`${getRepositoryLabel(result.repoName).replace("/", "-")}-script.txt`, editableScript)} className="font-bold text-purple-200 underline underline-offset-4">Export edited script</button></div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[620px] place-items-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-purple-400/20 bg-purple-400/[0.08] text-2xl text-purple-300">▶</div>
                <h3 className="mt-6 text-xl font-bold">{generating ? "Your explainer is being assembled" : "Ready for a repository"}</h3>
                <p className="mt-3 text-sm leading-6 text-white/40">{generating ? "Real pipeline progress appears in the configuration panel. You can leave this preview open while rendering continues." : "Choose a repository and format. The finished video, transcript, architecture, and downloads will appear here."}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
