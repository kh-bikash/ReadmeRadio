import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, nodeAccent, inferNodeKind } from "../theme";
import type { NodeLayoutItem } from "../MainVideo";
import type { CaptionItem } from "../Root";

export interface SpotlightCardProps {
  node: NodeLayoutItem;
  index: number;
  caption: CaptionItem | null;
  canvasW: number;
  canvasH: number;
}

const TYPE_LABELS: Record<string, string> = {
  service: "SERVICE",
  datastore: "DATA STORE",
  client: "CLIENT",
  queue: "QUEUE",
  external: "EXTERNAL",
};

export const SpotlightCard: React.FC<SpotlightCardProps> = ({ node, index, caption, canvasW, canvasH }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kind = inferNodeKind(node.label);
  const accent = nodeAccent[kind];

  const entrance = spring({ frame: frame - 6, fps, config: theme.spring.snappy });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [0.85, 1]);
  const translateY = interpolate(entrance, [0, 1], [12, 0]);

  const cardW = 260;
  const cardH = 130;
  const x = Math.min(Math.max(node.x - (cardW - 180) / 2, 8), canvasW - cardW - 8);
  const y = Math.min(node.y + 80 + 12, canvasH - cardH - 8);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: cardW,
        height: cardH,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: theme.rounded.lg,
          background: theme.surface,
          border: `1px solid ${theme.hairline}`,
          boxShadow: theme.shadow.elevated,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: theme.rounded.sm,
              background: theme.primary,
              color: theme.onPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.type.mono.fontFamily,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {index + 1}
          </div>
          <span
            style={{
              ...theme.type.eyebrow,
              color: accent.color,
              fontSize: 9,
            }}
          >
            {TYPE_LABELS[kind]}
          </span>
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: theme.ink,
            lineHeight: 1.15,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {node.label}
        </span>
        {caption && (
          <span
            style={{
              fontSize: 12,
              color: theme.inkMuted,
              lineHeight: 1.35,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              marginTop: 2,
            }}
          >
            {caption.text}
          </span>
        )}
      </div>
    </div>
  );
};
