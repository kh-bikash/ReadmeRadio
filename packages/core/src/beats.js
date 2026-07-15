import { tokenize } from "./textMatch.js";

const RESYNC_LOOKAHEAD = 4;
const MIN_BUCKET_SECONDS = 7;

/**
 * Sequentially aligns LLM-authored "teaching beats" to real forced-alignment
 * word timings. Beat narrations concatenate to the exact TTS input text, so
 * this walks a single cursor through `words` consuming each beat's tokens in
 * order — not an unordered keyword search like `deriveNodeCueTimes`, since
 * beat order is authored and must be preserved.
 * @param {Array<Record<string, any>>} beats
 * @param {{word:string,start:number,end:number}[]} words
 * @param {number} fps
 * @param {number} duration
 */
export function alignBeatsToWords(beats, words, fps, duration) {
  if (!Array.isArray(beats) || beats.length === 0) return [];

  const wordTokens = words.map((w) => tokenize(w.word)[0] ?? "");
  let wordIdx = 0;
  let prevEnd = 0;
  const assignments = [];

  for (const beat of beats) {
    const beatTokens = tokenize(beat.narration);
    const beatStartWordIdx = wordIdx;
    let matched = beatTokens.length > 0;

    for (let ti = 0; ti < beatTokens.length; ti++) {
      if (wordIdx >= words.length) {
        matched = false;
        break;
      }
      if (wordTokens[wordIdx] === beatTokens[ti]) {
        wordIdx++;
        continue;
      }
      let resynced = false;
      for (let look = 1; look <= RESYNC_LOOKAHEAD && wordIdx + look < words.length; look++) {
        if (wordTokens[wordIdx + look] === beatTokens[ti]) {
          wordIdx += look + 1;
          resynced = true;
          break;
        }
      }
      if (!resynced) {
        matched = false;
        wordIdx = Math.min(words.length, wordIdx + (beatTokens.length - ti));
        break;
      }
    }

    const beatEndWordIdx = wordIdx;
    const start = words[beatStartWordIdx]?.start ?? prevEnd;
    const end = beatEndWordIdx > beatStartWordIdx ? (words[beatEndWordIdx - 1]?.end ?? start) : start;
    const clampedEnd = Math.max(end, start);

    assignments.push({
      ...beat,
      start,
      end: clampedEnd,
      startFrame: Math.round(start * fps),
      endFrame: Math.round(clampedEnd * fps),
      matched,
    });
    prevEnd = clampedEnd;
  }

  if (assignments.length > 0) {
    assignments[0].start = 0;
    assignments[0].startFrame = 0;

    // Scenes must tile the timeline with zero gaps and zero overlaps — a gap
    // (very common: real speech has natural pauses between words/sentences,
    // so cur.end < next.start almost everywhere) means no scene matches that
    // frame range at all, which renders as a blank flicker between beats.
    for (let i = 0; i < assignments.length - 1; i++) {
      const cur = assignments[i];
      const next = assignments[i + 1];
      cur.end = next.start;
      cur.endFrame = next.startFrame;
    }

    const last = assignments[assignments.length - 1];
    last.end = duration;
    last.endFrame = Math.round(duration * fps);
  }

  return assignments;
}

function groupCaptionsIntoBuckets(captions, minDur = MIN_BUCKET_SECONDS) {
  if (!captions || captions.length === 0) return [];

  const sentences = [];
  let sentence = null;
  for (const cap of captions) {
    if (!sentence) sentence = { start: cap.start, end: cap.end, text: cap.text };
    else {
      sentence.end = cap.end;
      sentence.text += ` ${cap.text}`;
    }
    if (/[.!?]$/.test(cap.text.trim())) {
      sentences.push(sentence);
      sentence = null;
    }
  }
  if (sentence) sentences.push(sentence);

  const buckets = [];
  let group = null;
  for (const sent of sentences) {
    if (!group) {
      group = { start: sent.start, end: sent.end, text: sent.text };
    } else if (sent.end - group.start < minDur) {
      group.end = sent.end;
      group.text += ` ${sent.text}`;
    } else {
      buckets.push(group);
      group = { start: sent.start, end: sent.end, text: sent.text };
    }
  }
  if (group) buckets.push(group);

  const merged = [];
  for (const bucket of buckets) {
    const last = merged[merged.length - 1];
    if (last && bucket.end - last.start < minDur) {
      last.end = bucket.end;
      last.text += ` ${bucket.text}`;
    } else {
      merged.push({ ...bucket });
    }
  }

  // Buckets must tile the timeline with zero gaps — real captions have small
  // pauses between them (bucket[i].end < bucket[i+1].start almost always),
  // and a gap here means no scene covers that frame range at all.
  for (let i = 0; i < merged.length - 1; i++) {
    merged[i].end = merged[i + 1].start;
  }
  return merged;
}

/**
 * Builds a fallback beat list directly from real caption timestamps, used only
 * when the LLM response has no usable `beats` (old-format or malformed). No
 * comparison/key_term beats are synthesized — there is no structured content
 * to put in them, so those scene types simply never appear for a fallback video.
 * @param {{start:number,end:number,text:string}[]} captionsJson
 * @param {{id:string,label:string}[]} nodes
 * @param {unknown} readmeData reserved for a future content-aware fallback; unused today
 * @param {number} [fps]
 */
export function synthesizeFallbackBeats(captionsJson, nodes, readmeData, fps = 30) {
  const buckets = groupCaptionsIntoBuckets(captionsJson);
  if (buckets.length === 0) return [];

  let howItWorksCount = 0;
  const beats = buckets.map((bucket, i) => {
    const isFirst = i === 0;
    const isLast = i === buckets.length - 1;
    const kind = isFirst ? "hook" : isLast ? "recap" : i % 2 === 0 ? "how_it_works" : "concept";

    const narration = bucket.text.trim();
    const title = narration.split(/[.!?]/)[0].trim().split(/\s+/).slice(0, 5).join(" ");
    const start = bucket.start;
    const end = bucket.end;

    const beat = {
      id: `fallback-${i + 1}`,
      kind,
      title,
      narration,
      start,
      end,
      startFrame: Math.round(start * fps),
      endFrame: Math.round(end * fps),
      matched: true,
    };
    if (kind === "how_it_works" && nodes.length > 0) {
      beat.nodeIds = [nodes[howItWorksCount % nodes.length].id];
      howItWorksCount++;
    }
    return beat;
  });

  beats[0].start = 0;
  beats[0].startFrame = 0;
  const totalDuration = captionsJson[captionsJson.length - 1]?.end ?? beats[beats.length - 1].end;
  beats[beats.length - 1].end = totalDuration;
  beats[beats.length - 1].endFrame = Math.round(totalDuration * fps);

  return beats;
}
