import assert from "node:assert/strict";
import test from "node:test";
import { calculateLayout, deriveNodeCueTimes, parseMermaid } from "../src/diagram.js";

test("parses common Mermaid node shapes and de-duplicates edges", () => {
  const parsed = parseMermaid("graph TD\nA[API] --> B((Worker))\nA --> B\nB --> C{Renderer}");
  assert.deepEqual(parsed.nodes.map((node) => node.label), ["API", "Worker", "Renderer"]);
  assert.deepEqual(parsed.connections, [{ from: "A", to: "B" }, { from: "B", to: "C" }]);
});

test("lays out cyclic graphs without overflowing the canvas", () => {
  const parsed = parseMermaid("graph LR\nA[One] --> B[Two]\nB --> A");
  const layout = calculateLayout(parsed.nodes, parsed.connections, { width: 640, height: 360, cardWidth: 150 });
  assert.equal(Object.keys(layout).length, 2);
  for (const node of Object.values(layout)) {
    assert.ok(node.x >= 0 && node.x + 150 <= 640);
    assert.ok(node.y >= 0 && node.y + 58 <= 360);
  }
});

test("matches diagram nodes to caption timestamps", () => {
  const cues = deriveNodeCueTimes(
    [{ id: "api", label: "GitHub API" }, { id: "tts", label: "Voice synthesis" }],
    [{ start: 1, end: 2, text: "We fetch metadata from the GitHub API." }, { start: 8, end: 9, text: "Next comes voice synthesis." }],
    10,
  );
  assert.equal(cues.api, 1);
  assert.equal(cues.tts, 8);
});

test("wraps long chains into non-overlapping rows", () => {
  const parsed = parseMermaid("graph LR\nA[A] --> B[B] --> C[C] --> D[D] --> E[E] --> F[F]");
  const layout = calculateLayout(parsed.nodes, parsed.connections, { width: 640, height: 360, cardWidth: 150, cardHeight: 58, padding: 24 });
  assert.equal(new Set(Object.values(layout).map((node) => node.row)).size, 2);
  for (const left of Object.values(layout)) {
    for (const right of Object.values(layout)) {
      if (left.id === right.id) continue;
      const overlaps = left.x < right.x + 150 && left.x + 150 > right.x && left.y < right.y + 58 && left.y + 58 > right.y;
      assert.equal(overlaps, false, `${left.id} overlaps ${right.id}`);
    }
  }
});
