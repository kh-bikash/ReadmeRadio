import React from "react";
import { spring, interpolate } from "remotion";
import { theme } from "../theme";
import { useSceneFrame } from "./useSceneFrame";

export interface CodeSceneProps {
  code: string;
  lang: string;
  title: string;
  startFrame: number;
  endFrame: number;
}

export const CodeScene: React.FC<CodeSceneProps> = ({ code, lang, title, startFrame, endFrame }) => {
  const { fps, local, duration, opacity, isVisible } = useSceneFrame(startFrame, endFrame);
  if (!isVisible) return null;

  const titleSpring = spring({ frame: local, fps, config: theme.spring.snappy });
  const titleY = interpolate(titleSpring, [0, 1], [16, 0]);

  const codeLines = code.split("\n");
  const totalChars = code.length;
  // Type at whatever speed finishes within this scene's own duration (minus a
  // small header/settle budget) instead of a fixed chars/frame rate that could
  // outlast a short beat or finish awkwardly early in a long one.
  const availableFrames = Math.max(1, duration - 40);
  const typeSpeed = totalChars / availableFrames;
  const charsToShow = Math.min(totalChars, Math.floor(local * typeSpeed));
  const typingComplete = charsToShow >= totalChars;
  const caretVisible = !typingComplete && Math.floor(local / 25) % 2 === 0;

  let charCount = 0;
  const visibleLines: string[] = [];
  for (const line of codeLines) {
    if (charCount + line.length + 1 <= charsToShow) {
      visibleLines.push(line);
      charCount += line.length + 1;
    } else {
      const remaining = charsToShow - charCount;
      if (remaining > 0) visibleLines.push(line.slice(0, remaining));
      break;
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        padding: "32px 48px",
        overflow: "hidden",
      }}
    >
      <h2
        style={{
          ...theme.type.heading2,
          color: theme.ink,
          marginBottom: 16,
          flexShrink: 0,
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          flex: 1,
          borderRadius: theme.rounded.lg,
          background: "#1e1e2e",
          border: `1px solid ${theme.hairline}`,
          boxShadow: theme.shadow.elevated,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxWidth: 800,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 8 }}>
            {lang}
          </span>
        </div>
        <div style={{ padding: 20, flex: 1, overflow: "hidden" }}>
          <pre
            style={{
              margin: 0,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 14,
              lineHeight: 1.7,
              color: "#cdd6f4",
            }}
          >
            {visibleLines.map((line, i) => (
              <div key={i} style={{ minHeight: "1.7em" }}>
                {highlightLine(line)}
                {i === visibleLines.length - 1 && caretVisible && (
                  <span style={{ color: theme.primary, fontWeight: 700 }}>▎</span>
                )}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
};

function highlightLine(line: string) {
  if (!line) return null;
  const parts: React.ReactNode[] = [];
  const regex = /(\/\/.*$|#.*$|".*?"|'.*?'|\b(?:import|from|def|class|return|if|else|elif|for|while|try|except|with|as|async|await|const|let|var|function|export|new|true|false|None|null)\b|\b\d+\b)/g;
  let lastIdx = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    let color = "#cdd6f4";
    if (/^(\/\/|#)/.test(token)) color = "#585b70";
    else if (/^["']/.test(token)) color = "#a6e3a1";
    else if (/^(import|from|def|class|return|if|else|elif|for|while|try|except|with|as|async|await|const|let|var|function|export|new)$/.test(token)) color = "#cba6f7";
    else if (/^(true|false|None|null)$/.test(token)) color = "#fab387";
    else if (/^\d+$/.test(token)) color = "#fab387";
    parts.push(<span key={key++} style={{ color }}>{token}</span>);
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < line.length) parts.push(line.slice(lastIdx));
  return parts.length > 0 ? parts : line;
}
