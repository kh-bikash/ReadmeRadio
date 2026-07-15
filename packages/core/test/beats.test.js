import assert from "node:assert/strict";
import test from "node:test";
import { alignBeatsToWords, synthesizeFallbackBeats } from "../src/beats.js";

function words(text, startStep = 0.5) {
  return text.split(/\s+/).map((word, i) => ({
    word,
    start: i * startStep,
    end: i * startStep + startStep * 0.8,
  }));
}

test("aligns beats to words sequentially in narration order", () => {
  const w = words("Hello there friend this is a demo of the pipeline");
  const beats = [
    { id: "b1", kind: "hook", title: "Hook", narration: "Hello there friend" },
    { id: "b2", kind: "concept", title: "Concept", narration: "this is a demo" },
    { id: "b3", kind: "recap", title: "Recap", narration: "of the pipeline" },
  ];
  const result = alignBeatsToWords(beats, w, 30, w[w.length - 1].end);

  assert.equal(result.length, 3);
  assert.equal(result[0].start, 0);
  assert.ok(result[0].matched);
  // Beats must tile the timeline with zero gaps — the word list used here has
  // a natural 0.1s pause between every word, which previously leaked through
  // as a gap between beats (a scene-less stretch that renders as a blank flicker).
  assert.equal(result[0].end, result[1].start);
  assert.equal(result[1].end, result[2].start);
  // last beat forced to run to the authoritative total duration
  assert.equal(result[2].end, w[w.length - 1].end);
});

test("recovers from a small transcription mismatch via bounded resync", () => {
  // The TTS/alignment word list has an extra filler word ("um") the beat text doesn't mention.
  const w = [
    { word: "so", start: 0, end: 0.4 },
    { word: "um", start: 0.4, end: 0.6 },
    { word: "here's", start: 0.6, end: 1.0 },
    { word: "how", start: 1.0, end: 1.3 },
    { word: "it", start: 1.3, end: 1.5 },
    { word: "works", start: 1.5, end: 1.9 },
  ];
  const beats = [{ id: "b1", kind: "how_it_works", title: "How", narration: "so here's how it works" }];
  const result = alignBeatsToWords(beats, w, 30, 1.9);

  assert.equal(result.length, 1);
  assert.equal(result[0].start, 0);
  assert.equal(result[0].end, 1.9);
});

test("falls back to proportional advancement when resync fails entirely", () => {
  const w = words("completely unrelated audio content here");
  const beats = [{ id: "b1", kind: "concept", title: "X", narration: "totally different words entirely" }];
  const result = alignBeatsToWords(beats, w, 30, w[w.length - 1].end);

  assert.equal(result.length, 1);
  assert.equal(result[0].matched, false);
});

test("synthesizes fallback beats from real caption buckets when no LLM beats are available", () => {
  const captions = [
    { start: 0, end: 3, text: "Welcome to the project." },
    { start: 3, end: 11, text: "It has a CLI, a server, and a database that all work together." },
    { start: 11, end: 19, text: "The server talks to the database on every request that comes in." },
    { start: 19, end: 24, text: "That's the whole system in a nutshell." },
  ];
  const nodes = [{ id: "cli", label: "CLI" }, { id: "server", label: "Server" }, { id: "db", label: "Database" }];

  const beats = synthesizeFallbackBeats(captions, nodes, {}, 30);

  assert.ok(beats.length >= 2);
  assert.equal(beats[0].kind, "hook");
  assert.equal(beats[0].start, 0);
  assert.equal(beats[beats.length - 1].kind, "recap");
  assert.equal(beats[beats.length - 1].end, 24);
  assert.ok(beats.every((b) => b.kind !== "comparison" && b.kind !== "key_term"));
  // Zero gaps between consecutive beats (captions in this fixture do not
  // perfectly abut — end/start differ by fractions of a second).
  for (let i = 0; i < beats.length - 1; i++) {
    assert.equal(beats[i].end, beats[i + 1].start, `gap between beat ${i} and ${i + 1}`);
  }
});
