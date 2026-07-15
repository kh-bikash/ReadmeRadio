import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme } from "../theme";

export interface CameraMove {
  startFrame: number;
  endFrame: number;
  fromX?: number;
  fromY?: number;
  fromScale?: number;
  toX: number;
  toY: number;
  toScale: number;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

// Accumulates a sequence of camera moves into a single (x, y, scale) state for
// the current frame. Each move springs from wherever the camera already is
// (or an explicit fromX/fromY/fromScale) toward its target, so moves can be
// chained to visit several points in order (e.g. one diagram node after another).
export function useCameraMoves(moves: CameraMove[], initial: CameraState = { x: 0, y: 0, scale: 1 }): CameraState {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let x = initial.x;
  let y = initial.y;
  let scale = initial.scale;

  for (const move of moves) {
    if (frame < move.startFrame) continue;
    const dur = Math.max(1, move.endFrame - move.startFrame);
    const local = Math.min(frame - move.startFrame, dur);
    const s = spring({ frame: local, fps, durationInFrames: dur, config: theme.spring.camera });
    const fx = move.fromX ?? x;
    const fy = move.fromY ?? y;
    const fs = move.fromScale ?? scale;
    x = interpolate(s, [0, 1], [fx, move.toX]);
    y = interpolate(s, [0, 1], [fy, move.toY]);
    scale = interpolate(s, [0, 1], [fs, move.toScale]);
  }

  return { x, y, scale };
}
