import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

export interface SceneFrameResult {
  frame: number;
  fps: number;
  local: number;
  duration: number;
  opacity: number;
  isVisible: boolean;
}

export interface UseSceneFrameOptions {
  exitFrames?: number;
  enterFrames?: number;
}

// Shared "is this scene on screen right now" bookkeeping, extracted from the
// identical block every scene component used to duplicate: local frame relative
// to the scene's own window, a fade-in on entry and a fade-out before the scene
// ends. Clamps the exit start so very short scenes never get a degenerate
// (non-increasing) interpolate range.
export function useSceneFrame(
  startFrame: number,
  endFrame: number,
  opts?: UseSceneFrameOptions,
): SceneFrameResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  const duration = endFrame - startFrame;
  const exitFrames = opts?.exitFrames ?? 30;
  const enterFrames = opts?.enterFrames ?? 20;
  const isVisible = local >= 0 && frame <= endFrame;

  const exitStart = Math.max(0, duration - exitFrames);
  const exitOpacity = interpolate(local, [exitStart, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const enterOpacity = interpolate(local, [0, enterFrames], [0, 1], { extrapolateRight: "clamp" });
  const opacity = Math.min(enterOpacity, exitOpacity);

  return { frame, fps, local, duration, opacity, isVisible };
}
