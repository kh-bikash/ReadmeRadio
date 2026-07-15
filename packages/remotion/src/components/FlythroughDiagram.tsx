import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme, nodeAccent, inferNodeKind } from "../theme";
import type { NodeLayoutItem, ConnectionItem } from "../MainVideo";
import type { CaptionItem } from "../Root";
import {
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CARD_WIDTH,
  DIAGRAM_CARD_HEIGHT,
} from "../../../core/src/diagramLayout.js";
import { SpotlightCard } from "./SpotlightCard";
import { useCameraMoves, type CameraMove } from "./useCameraMoves";

export interface FlythroughDiagramProps {
  layout: Record<string, NodeLayoutItem>;
  connections: ConnectionItem[];
  cueTimes: Record<string, number>;
  duration: number;
  currentTime: number;
  activeNodeId: string | null;
  captions: CaptionItem[];
  // When set, the camera visits these node ids in order, evenly spaced across
  // [sceneStartFrame, sceneEndFrame] — lets a single "how it works" beat that
  // discusses two nodes pan from one to the other instead of only ever
  // showing the single globally-"active" node.
  focusNodeIds?: string[];
  sceneStartFrame?: number;
  sceneEndFrame?: number;
}

const CW = DIAGRAM_CANVAS_WIDTH;
const CH = DIAGRAM_CANVAS_HEIGHT;
// SpotlightCard's own CSS px dimensions (260x130) were designed for a full
// video-canvas HTML layout, not this compact 640x480 SVG virtual canvas — at
// 1:1 it renders larger than the node cards themselves. Counter-scale it down
// and feed it a proportionally larger virtual canvas so its own clamping math
// still keeps it on-screen once the visual scale-down is applied.
const SPOTLIGHT_SCALE = 0.5;
const NW = DIAGRAM_CARD_WIDTH;
const NH = DIAGRAM_CARD_HEIGHT;
const ZOOM = 2.0;
const ZOOM_FRAMES = 50;

const ICONS: Record<string, string> = {
  cpu: "M6 6h12v12H6zM9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2",
  db: "M3 5c0-1.66 4-3 9-3s9 1.34 9 3-4 3-9 3-9-1.34-9-3zM3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3",
  user: "M12 8a4 4 0 100-8 4 4 0 000 8zM4 22c0-4 4-7 8-7s8 3 8 7",
  queue: "M3 7h6v10H3zM10 7h6v10h-6zM17 7h4v10h-4z",
  cloud: "M17.5 19a4.5 4.5 0 00.5-9 6 6 0 00-11.5 2A4 4 0 006 19z",
};

function bz(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
}

export const FlythroughDiagram: React.FC<FlythroughDiagramProps> = ({
  layout, connections, cueTimes, duration, currentTime, activeNodeId, captions,
  focusNodeIds, sceneStartFrame, sceneEndFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes = Object.values(layout);
  const sorted = [...nodes].sort((a, b) => (cueTimes[a.id] ?? 0) - (cueTimes[b.id] ?? 0));
  const cap = captions.find((c) => currentTime >= c.start && currentTime <= c.end) ?? null;
  // The full graph structure reads from the start (dim), so a viewer gets
  // oriented immediately; narration then progressively lights it up — a
  // highlight pass over a visible map, not a reveal of a hidden one.
  const globalAppear = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // Camera: visits focusNodeIds (this beat's nodes) in sequence across the
  // beat's own window when available; otherwise falls back to a single move
  // toward activeNodeId keyed off its own narration cue time.
  const focusIds = (focusNodeIds ?? (activeNodeId ? [activeNodeId] : [])).filter((id) => layout[id]);
  let cameraMoves: CameraMove[] = [];
  if (focusIds.length > 0) {
    if (sceneStartFrame !== undefined && sceneEndFrame !== undefined) {
      const span = Math.max(1, sceneEndFrame - sceneStartFrame);
      const per = span / focusIds.length;
      cameraMoves = focusIds.map((id, i) => {
        const n = layout[id];
        return {
          startFrame: Math.round(sceneStartFrame + i * per),
          endFrame: Math.round(sceneStartFrame + (i + 1) * per),
          toX: n.x + NW / 2, toY: n.y + NH / 2, toScale: ZOOM,
        };
      });
    } else {
      const id = focusIds[0];
      const n = layout[id];
      const cueFrame = Math.round((cueTimes[id] ?? 0) * fps);
      cameraMoves = [{ startFrame: cueFrame, endFrame: cueFrame + ZOOM_FRAMES, toX: n.x + NW / 2, toY: n.y + NH / 2, toScale: ZOOM }];
    }
  }
  const cam = useCameraMoves(cameraMoves, { x: CW / 2, y: CH / 2, scale: 1 });
  const zw = (CW + 80) / cam.scale;
  const zh = (CH + 60) / cam.scale;
  const vbX = cam.x - zw / 2;
  const vbY = cam.y - zh / 2;
  const vbW = zw;
  const vbH = zh;
  const zs = Math.max(0, Math.min(1, (cam.scale - 1) / (ZOOM - 1)));

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <pattern id="ft-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.8" fill={theme.inkFaint} opacity="0.08" />
        </pattern>
        <radialGradient id="ft-vig" cx="50%" cy="50%" r="55%">
          <stop offset="55%" stopColor={theme.surface} stopOpacity="0" />
          <stop offset="100%" stopColor={theme.surface} stopOpacity="0.6" />
        </radialGradient>
        {/* Drop shadow filter for nodes */}
        <filter id="ft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.08" />
        </filter>
        <filter id="ft-shadow-active" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#0075de" floodOpacity="0.15" />
        </filter>
        {/* Glow filter */}
        <filter id="ft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Per-node gradients */}
        {nodes.map((n) => {
          const k = inferNodeKind(n.label);
          const a = nodeAccent[k];
          return (
            <linearGradient key={`g-${n.id}`} id={`g-${n.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={theme.surface} />
              <stop offset="100%" stopColor={a.bg} />
            </linearGradient>
          );
        })}
        {/* Edge gradient */}
        <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={theme.primary} stopOpacity="0.3" />
          <stop offset="50%" stopColor={theme.primary} stopOpacity="1" />
          <stop offset="100%" stopColor={theme.primary} stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Background layers */}
      <rect x={-40} y={-30} width={CW+80} height={CH+60} fill={theme.surface} rx={16} />
      <rect x={0} y={0} width={CW} height={CH} fill="url(#ft-grid)" rx={12} />
      <rect x={-40} y={-30} width={CW+80} height={CH+60} fill="url(#ft-vig)" rx={16} />

      {/* Title */}
      <text x={16} y={22} fontSize={10} fontWeight={600} fill={theme.inkFaint} fontFamily="monospace" letterSpacing="1.5" opacity={0.3}>
        SYSTEM ARCHITECTURE
      </text>

      {/* Edges — gradient pipes with arrowheads */}
      {connections.map((conn, idx) => {
        const fn = layout[conn.from];
        const tn = layout[conn.to];
        if (!fn || !tn) return null;

        const x1 = fn.x + NW, y1 = fn.y + NH/2;
        const x2 = tn.x, y2 = tn.y + NH/2;
        const cx1 = x1 + 50, cy1 = y1;
        const cx2 = x2 - 50, cy2 = y2;
        const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

        const toCue = cueTimes[tn.id] ?? 0;
        const active = currentTime >= toCue && currentTime <= toCue + 5;
        const local = frame - Math.round(toCue * fps);

        // Flow particles with trails
        const cycleLen = 55;
        const p1t = active && local >= 0 ? (local % cycleLen) / cycleLen : -1;
        const p2t = active && local >= 0 ? ((local + 28) % cycleLen) / cycleLen : -1;
        const p1x = p1t >= 0 ? bz(p1t, x1, cx1, cx2, x2) : 0;
        const p1y = p1t >= 0 ? bz(p1t, y1, cy1, cy2, y2) : 0;
        const p2x = p2t >= 0 ? bz(p2t, x1, cx1, cx2, x2) : 0;
        const p2y = p2t >= 0 ? bz(p2t, y1, cy1, cy2, y2) : 0;

        // Trail points (behind main particle)
        const trail1t = p1t >= 0 ? Math.max(0, p1t - 0.08) : -1;
        const trail2t = p1t >= 0 ? Math.max(0, p1t - 0.16) : -1;
        const tr1x = trail1t >= 0 ? bz(trail1t, x1, cx1, cx2, x2) : 0;
        const tr1y = trail1t >= 0 ? bz(trail1t, y1, cy1, cy2, y2) : 0;
        const tr2x = trail2t >= 0 ? bz(trail2t, x1, cx1, cx2, x2) : 0;
        const tr2y = trail2t >= 0 ? bz(trail2t, y1, cy1, cy2, y2) : 0;

        return (
          <g key={`e-${idx}`} opacity={globalAppear}>
            {/* Base pipe — always visible, dim, so the whole graph reads immediately */}
            <path d={d} fill="none" stroke={theme.hairline} strokeWidth={2} opacity={0.35} strokeLinecap="round" />

            {/* Active gradient overlay */}
            <path d={d} fill="none"
              stroke={active ? "url(#edge-grad)" : "rgba(0,117,222,0.06)"}
              strokeWidth={active ? 3 : 1.5}
              strokeDasharray={active ? "6 3" : undefined}
              strokeLinecap="round"
              style={{ strokeDashoffset: active ? -frame * 0.35 : 0, opacity: active ? 0.9 : 0.15 }}
              filter={active ? "url(#ft-glow)" : undefined}
            />

            {/* Arrowhead */}
            <path d={`M ${x2-8} ${y2-4} L ${x2} ${y2} L ${x2-8} ${y2+4} L ${x2-5} ${y2}`}
              fill={active ? theme.primary : theme.inkFaint}
              opacity={active ? 0.9 : 0.2}
            />

            {/* Particle trails (fading dots behind main particle) */}
            {trail2t >= 0 && <circle cx={tr2x} cy={tr2y} r={1.5} fill={theme.primary} opacity={0.2} />}
            {trail1t >= 0 && <circle cx={tr1x} cy={tr1y} r={2.5} fill={theme.primary} opacity={0.4} />}

            {/* Main particles */}
            {p1t >= 0 && (
              <>
                <circle cx={p1x} cy={p1y} r={9} fill={theme.primary} opacity={0.08} />
                <circle cx={p1x} cy={p1y} r={4.5} fill={theme.primary} opacity={0.9} filter="url(#ft-glow)" />
              </>
            )}
            {p2t >= 0 && <circle cx={p2x} cy={p2y} r={2.5} fill={theme.primary} opacity={0.4} />}

            {/* Edge label, when the mermaid source named this relationship */}
            {conn.label && (() => {
              const mx = bz(0.5, x1, cx1, cx2, x2);
              const my = bz(0.5, y1, cy1, cy2, y2);
              return (
                <g opacity={active ? 0.95 : 0.45}>
                  <rect x={mx - conn.label.length * 3 - 6} y={my - 9} width={conn.label.length * 6 + 12} height={16} rx={8}
                    fill={theme.surface} stroke={theme.hairline} strokeWidth={0.5} />
                  <text x={mx} y={my + 3.5} fontSize={9} fontWeight={600} textAnchor="middle"
                    fill={active ? theme.primary : theme.inkMuted} fontFamily="Inter, sans-serif">
                    {conn.label}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Nodes */}
      {sorted.map((node, di) => {
        const kind = inferNodeKind(node.label);
        const accent = nodeAccent[kind];
        const cue = cueTimes[node.id] ?? (di * (duration / (nodes.length || 1)));
        const cueFrame = Math.round(cue * fps);
        const isActive = node.id === activeNodeId;
        const origIdx = nodes.indexOf(node);

        // Dim-to-bright activation rather than pop-in-from-nothing: the node
        // is already part of the visible map, narration just brings it into focus.
        const activation = interpolate(frame, [cueFrame, cueFrame + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const baseOpacity = globalAppear * interpolate(activation, [0, 1], [0.16, 1]);

        // Active expansion
        const ew = isActive ? NW + 16 : NW;
        const eh = isActive ? NH + 4 : NH;
        const ex = isActive ? node.x - 8 : node.x;
        const ey = isActive ? node.y - 2 : node.y;

        // Pulse ring for active node
        const pulseT = (frame % 60) / 60;
        const pulseR = isActive ? interpolate(pulseT, [0, 1], [0, 40]) : 0;
        const pulseO = isActive ? interpolate(pulseT, [0, 0.5, 1], [0.3, 0.05, 0]) : 0;

        return (
          <g key={`n-${node.id}`} opacity={baseOpacity}
            filter={isActive ? "url(#ft-shadow-active)" : "url(#ft-shadow)"}>

            {/* Pulse ring */}
            {isActive && pulseO > 0 && (
              <rect x={ex - pulseR/2} y={ey - pulseR/2} width={ew + pulseR} height={eh + pulseR}
                rx={12 + pulseR/3} fill="none" stroke={theme.primary} strokeWidth={1.5} opacity={pulseO} />
            )}

            {/* Card with gradient */}
            <rect x={ex} y={ey} width={ew} height={eh} rx={10}
              fill={isActive ? `url(#g-${node.id})` : theme.surface}
              stroke={isActive ? theme.primary : theme.hairline}
              strokeWidth={isActive ? 2 : 1}
            />

            {/* Inner highlight (top edge) */}
            <rect x={ex + 1} y={ey + 1} width={ew - 2} height={1} rx={0.5}
              fill="rgba(255,255,255,0.6)" opacity={0.5} />

            {/* Active top bar */}
            {isActive && <rect x={ex} y={ey} width={ew} height={3} rx={1.5} fill={accent.color} />}

            {/* Icon background */}
            <circle cx={ex + 22} cy={ey + eh/2} r={13}
              fill={isActive ? theme.primary : accent.bg}
            />
            {/* Icon inner shadow */}
            <circle cx={ex + 22} cy={ey + eh/2 - 1} r={13}
              fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5}
            />

            {/* Icon */}
            <g transform={`translate(${ex + 14} ${ey + eh/2 - 10})`}
              stroke={isActive ? theme.onPrimary : accent.color}
              fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS[accent.icon]} />
            </g>

            {/* Label */}
            <text x={ex + 42} y={ey + 25} fontSize={isActive ? 13 : 12} fontWeight={600}
              fill={isActive ? theme.ink : theme.inkSecondary} fontFamily="Inter, sans-serif">
              {node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label}
            </text>

            {/* Type */}
            <text x={ex + 42} y={ey + 39} fontSize={7.5} fontWeight={600}
              fill={isActive ? theme.primary : accent.color} opacity={0.6}
              fontFamily="monospace" letterSpacing="0.6">
              {kind.toUpperCase()}
            </text>

            {/* Number badge */}
            <rect x={ex + ew - 24} y={ey + eh/2 - 9} width={17} height={17} rx={4}
              fill={isActive ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.03)"} />
            <text x={ex + ew - 15.5} y={ey + eh/2 + 3} fontSize={8} fontWeight={700}
              textAnchor="middle" fill={isActive ? theme.onPrimary : theme.inkFaint}
              fontFamily="monospace">
              {String(origIdx + 1).padStart(2, "0")}
            </text>

            {/* Detail panel when zoomed in — HTML overlay via foreignObject, follows the viewBox zoom/pan */}
            {isActive && cap && zs > 0.4 && (
              <foreignObject x={0} y={0} width={CW} height={CH} style={{ overflow: "visible" }}>
                <div
                  style={{
                    position: "relative",
                    width: CW / SPOTLIGHT_SCALE,
                    height: CH / SPOTLIGHT_SCALE,
                    transform: `scale(${SPOTLIGHT_SCALE})`,
                    transformOrigin: "top left",
                    opacity: interpolate(zs, [0.4, 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                  }}
                >
                  <SpotlightCard
                    node={{ ...node, x: node.x / SPOTLIGHT_SCALE, y: (node.y + 24) / SPOTLIGHT_SCALE }}
                    index={origIdx}
                    caption={cap}
                    canvasW={CW / SPOTLIGHT_SCALE}
                    canvasH={CH / SPOTLIGHT_SCALE}
                  />
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      {/* Mini-map in corner (shows when zoomed in) */}
      {zs > 0.3 && (
        <g opacity={interpolate(zs, [0.3, 0.6], [0, 0.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>
          <rect x={-35} y={-25} width={80} height={64} rx={6} fill={theme.surface} stroke={theme.hairline} strokeWidth={0.5} />
          {/* Mini nodes */}
          {nodes.map((n) => {
            const mx = -35 + 4 + (n.x / CW) * 72;
            const my = -25 + 4 + (n.y / CH) * 56;
            const isAct = n.id === activeNodeId;
            return <rect key={`mm-${n.id}`} x={mx} y={my} width={4} height={2} rx={1}
              fill={isAct ? theme.primary : theme.inkFaint} opacity={isAct ? 1 : 0.4} />;
          })}
          {/* Current viewport indicator */}
          <rect x={-35 + 4 + ((vbX + 40) / (CW + 80)) * 72} y={-25 + 4 + ((vbY + 30) / (CH + 60)) * 56}
            width={(vbW / (CW + 80)) * 72} height={(vbH / (CH + 60)) * 56}
            fill="none" stroke={theme.primary} strokeWidth={0.5} opacity={0.6} rx={1} />
        </g>
      )}
    </svg>
  );
};
