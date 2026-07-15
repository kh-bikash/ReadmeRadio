#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { generateScriptAndDiagram } from './llm.js';
import { calculateLayout, deriveNodeCueTimes, parseMermaid } from '../core/src/diagram.js';
import {
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CARD_WIDTH,
  DIAGRAM_CARD_HEIGHT,
  DIAGRAM_PADDING,
} from '../core/src/diagramLayout.js';
import { normalizeGitHubRepository } from '../core/src/repository.js';
import { alignBeatsToWords, synthesizeFallbackBeats } from '../core/src/beats.js';

const REMOTION_FPS = 30; // matches Root.tsx's fixed fps

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: options.shell !== undefined ? options.shell : (process.platform === 'win32'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.forwardOutput) process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.forwardOutput) process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function srtToVtt(srtContent) {
  return `WEBVTT\n\n${srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

function parseReadme(md) {
  const features = [];
  const codeBlocks = [];
  const headers = [];
  let description = '';

  const lines = md.split(/\r?\n/);
  let inCode = false;
  let codeLang = '';
  let codeAccum = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim() || 'text';
        codeAccum = [];
      } else {
        inCode = false;
        const code = codeAccum.join('\n').trim();
        if (code.length > 10 && code.length < 800) {
          codeBlocks.push({ lang: codeLang, code });
        }
      }
      continue;
    }
    if (inCode) {
      codeAccum.push(line);
      continue;
    }

    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      headers.push(headerMatch[2].trim());
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
      if (text.length > 5 && text.length < 120) {
        features.push(text);
      }
      continue;
    }

    if (!description && line.trim().length > 30 && !line.startsWith('#') && !line.startsWith('[') && !line.startsWith('!')) {
      description = line.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    }
  }

  return {
    features: features.slice(0, 8),
    codeBlocks: codeBlocks.slice(0, 3),
    headers: headers.slice(0, 6),
    description: description.slice(0, 200),
  };
}

function progressReporter(enabled) {
  return (stage, progress, message) => {
    if (enabled) {
      process.stdout.write(`${JSON.stringify({ type: 'progress', stage, progress, message })}\n`);
    }
  };
}

// Helper to find Python executable in venv
async function getPythonExecutable() {
  const winPath = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
  const unixPath = path.join(__dirname, 'venv', 'bin', 'python');
  try {
    await fs.access(winPath);
    return winPath;
  } catch {}
  try {
    await fs.access(unixPath);
    return unixPath;
  } catch {}
  return 'python'; // Fallback
}

// SRT parser to convert captions to JSON
function parseSRT(srtContent) {
  const parseTime = (timeStr) => {
    const [hms, ms] = timeStr.split(',');
    const [h, m, s] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + s + Number(ms) / 1000;
  };

  const blocks = srtContent.trim().split(/\r?\n\r?\n/);
  return blocks.map(block => {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) return null;
    const times = lines[1].split(' --> ');
    if (times.length < 2) return null;
    const [startStr, endStr] = times;
    return {
      index: parseInt(lines[0], 10),
      start: parseTime(startStr),
      end: parseTime(endStr),
      text: lines.slice(2).join(' ')
    };
  }).filter(Boolean);
}

program
  .name('readme-radio')
  .description('Turn any GitHub repository into an explainer video')
  .argument('<repository>', 'GitHub repository URL or owner/repo (e.g., pallets/flask)')
  .option('-e, --engine <engine>', 'Rendering engine: remotion or hyperframes', 'remotion')
  .option('-o, --output-dir <outputDir>', 'Output directory for all generated assets', '.')
  .option('--tone <tone>', 'Narration tone: technical, friendly, cinematic, or concise', 'friendly')
  .option('--target-minutes <minutes>', 'Approximate narration duration in minutes', '3')
  .option('--aspect-ratio <ratio>', 'Video aspect ratio: 16:9, 1:1, or 9:16', '16:9')
  .option('--json-progress', 'Emit newline-delimited JSON progress events', false)
  .action(async (repository, options) => {
    const report = progressReporter(options.jsonProgress);
    let spinner;
    try {
      const repoName = normalizeGitHubRepository(repository);
      if (!['remotion', 'hyperframes'].includes(options.engine)) throw new Error('Engine must be remotion or hyperframes');
      if (!['technical', 'friendly', 'cinematic', 'concise'].includes(options.tone)) throw new Error('Unsupported narration tone');
      if (!['16:9', '1:1', '9:16'].includes(options.aspectRatio)) throw new Error('Unsupported aspect ratio');
      const targetMinutes = Number(options.targetMinutes);
      if (!Number.isFinite(targetMinutes) || targetMinutes < 1 || targetMinutes > 5) throw new Error('Target duration must be between 1 and 5 minutes');

      const targetOutputDir = path.resolve(options.outputDir);
      await fs.mkdir(targetOutputDir, { recursive: true });
      spinner = ora({ text: `Analyzing repository: ${repoName}...`, isSilent: options.jsonProgress }).start();

      // Step 1: Fetch README
      report('fetching', 8, 'Fetching repository README');
      spinner.text = `Fetching README for ${repoName}...`;
      const readmeUrl = `https://raw.githubusercontent.com/${repoName}/main/README.md`;
      let readmeContent = '';
      try {
        const response = await axios.get(readmeUrl, { timeout: 20000, maxContentLength: 1_000_000, responseType: 'text' });
        readmeContent = response.data;
      } catch {
        // Fallback to master
        const fallbackUrl = `https://raw.githubusercontent.com/${repoName}/master/README.md`;
        const response = await axios.get(fallbackUrl, { timeout: 20000, maxContentLength: 1_000_000, responseType: 'text' });
        readmeContent = response.data;
      }

      spinner.succeed(`Fetched README for ${repoName}`);
      console.log('README length:', readmeContent.length);

      // Extract structured content from README for rich visual scenes
      const readmeData = parseReadme(readmeContent);

      // Step 2: Generate Script via GLM
      report('scripting', 22, 'Writing and validating the narration outline');
      spinner.start('Writing script with AI...');
      const responseData = await generateScriptAndDiagram(readmeContent, repoName, {
        tone: options.tone,
        targetMinutes,
      });
      
      const script = responseData.script;
      const mermaid = responseData.mermaid;

      let scriptText = "";
      if (typeof script === 'string') {
        scriptText = script;
      } else if (typeof script === 'object' && script !== null) {
        scriptText = Object.values(script).map(val => typeof val === 'string' ? val : JSON.stringify(val)).join('\n\n');
      } else {
        scriptText = String(script || "");
      }

      let mermaidText = "";
      if (typeof mermaid === 'string') {
        mermaidText = mermaid;
      } else if (typeof mermaid === 'object' && mermaid !== null) {
        mermaidText = typeof mermaid.code === 'string' ? mermaid.code : JSON.stringify(mermaid);
      } else {
        mermaidText = String(mermaid || "");
      }

      const scriptPath = path.join(targetOutputDir, 'script.txt');
      const mermaidPath = path.join(targetOutputDir, 'architecture.mermaid');
      
      await fs.writeFile(scriptPath, scriptText);
      await fs.writeFile(mermaidPath, mermaidText);
      spinner.succeed('Script and Mermaid diagram generated');
      report('scripting', 38, 'Script and architecture diagram are ready');

      // Step 3: Audio Generation via Python Bridge
      report('audio', 45, 'Synthesizing narration and aligning captions');
      spinner.start('Synthesizing voiceover and generating captions...');
      const pythonScriptPath = path.join(__dirname, 'generate_audio.py');
      const pythonExe = await getPythonExecutable();
      
      const audioWavName = 'episode.wav';
      const captionsSrtName = 'captions.srt';
      const wordsJsonName = 'words.json';
      const targetAudioPath = path.join(targetOutputDir, audioWavName);
      const targetSrtPath = path.join(targetOutputDir, captionsSrtName);
      const targetWordsPath = path.join(targetOutputDir, wordsJsonName);

      await runCommand(pythonExe, [
        pythonScriptPath,
        '--input', scriptPath,
        '--output-audio', targetAudioPath,
        '--output-srt', targetSrtPath,
        '--output-words', targetWordsPath,
      ], { forwardOutput: !options.jsonProgress });
      spinner.succeed('Audio and captions ready');
      report('captions', 68, 'Narration and captions are synchronized');

      // Parse captions
      const srtContent = await fs.readFile(targetSrtPath, 'utf8');
      const captionsJson = parseSRT(srtContent);
      const totalDuration = captionsJson.length > 0 ? captionsJson[captionsJson.length - 1].end : 60;
      await fs.writeFile(path.join(targetOutputDir, 'captions.vtt'), srtToVtt(srtContent));
      await fs.writeFile(path.join(targetOutputDir, 'captions.json'), JSON.stringify(captionsJson, null, 2));

      // Parse word-level timings (for karaoke captions)
      let wordsJson = [];
      try {
        wordsJson = JSON.parse(await fs.readFile(targetWordsPath, 'utf8'));
      } catch {
        wordsJson = [];
      }

      // Parse Mermaid & Calculate Layout
      const { nodes, connections } = parseMermaid(mermaidText);
      const layoutMap = calculateLayout(nodes, connections, {
        width: DIAGRAM_CANVAS_WIDTH,
        height: DIAGRAM_CANVAS_HEIGHT,
        cardWidth: DIAGRAM_CARD_WIDTH,
        cardHeight: DIAGRAM_CARD_HEIGHT,
        padding: DIAGRAM_PADDING,
      });

      // Derive narration-synced cue times: each diagram node is highlighted
      // when the narration actually mentions its label, not on an even timer.
      const cueTimes = deriveNodeCueTimes(nodes, captionsJson, totalDuration);

      // Resolve each how_it_works beat's authored nodeIds against the real
      // parsed mermaid node ids, then convert the LLM-authored beat plan into
      // real audio-accurate timing — or synthesize a fallback plan directly
      // from captions when the LLM response didn't include usable beats.
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      const rawBeats = responseData.beats;
      let beatAssignments;
      if (Array.isArray(rawBeats) && rawBeats.length > 0) {
        const withResolvedNodes = rawBeats.map((b) => ({
          ...b,
          nodeIds: b.kind === 'how_it_works' ? (b.nodeIds ?? []).filter((id) => nodeIdSet.has(id)) : undefined,
        }));
        beatAssignments = alignBeatsToWords(withResolvedNodes, wordsJson, REMOTION_FPS, totalDuration);
      } else {
        beatAssignments = synthesizeFallbackBeats(captionsJson, nodes, readmeData, REMOTION_FPS);
      }

      const finalVideoPath = path.join(targetOutputDir, 'explainer.mp4');

      if (options.engine === 'hyperframes') {
        // Step 4: Render via HyperFrames
        report('rendering', 74, 'Rendering the HyperFrames composition');
        spinner.start('Rendering video with HyperFrames...');
        const hyperframesTemplateDir = path.join(targetOutputDir, '.hyperframes');
        await fs.mkdir(hyperframesTemplateDir, { recursive: true });
        
        // Copy audio wav to hyperframes
        const hfAudioPath = path.join(hyperframesTemplateDir, 'episode.wav');
        await fs.copyFile(targetAudioPath, hfAudioPath);
        
        // Highlight windows are narration-derived (cueTimes), not evenly spaced —
        // mirrors the Remotion path's NODE_ACTIVE_WINDOW-based highlighting.
        const HF_NODE_ACTIVE_WINDOW = 4;
        const cueOrder = [...nodes].sort((a, b) => (cueTimes[a.id] ?? 0) - (cueTimes[b.id] ?? 0));
        const nodeHighlight = {};
        cueOrder.forEach((node, i) => {
          const start = cueTimes[node.id] ?? 0;
          const nextStart = cueOrder[i + 1] ? (cueTimes[cueOrder[i + 1].id] ?? totalDuration) : totalDuration;
          nodeHighlight[node.id] = { start, duration: Math.max(2, Math.min(HF_NODE_ACTIVE_WINDOW + 2, nextStart - start)) };
        });

        // Compile nodes HTML elements
        const nodesHtml = Object.values(layoutMap).map((node, i) => {
          const { start, duration } = nodeHighlight[node.id] ?? { start: 0, duration: HF_NODE_ACTIVE_WINDOW };
          return `
            <div class="card-item" style="left: ${node.x}px; top: ${node.y}px; animation-name: cardHighlight; animation-delay: ${start}s; animation-duration: ${duration}s;">
              <div class="card-num">${i + 1}</div>
              <div class="card-label">${escapeHtml(node.label)}</div>
            </div>
          `;
        }).join('\n');

        // Compile connecting lines SVG
        const cardW = DIAGRAM_CARD_WIDTH;
        const cardH = DIAGRAM_CARD_HEIGHT;
        const svgLinesHtml = connections.map((conn, idx) => {
          const fromNode = layoutMap[conn.from];
          const toNode = layoutMap[conn.to];
          if (!fromNode || !toNode) return '';
          
          // Connect right-center of fromNode to left-center of toNode
          const x1 = fromNode.x + cardW;
          const y1 = fromNode.y + cardH / 2;
          const x2 = toNode.x;
          const y2 = toNode.y + cardH / 2;
          
          // Draw smooth cubic bezier curve
          const cx1 = x1 + 50;
          const cy1 = y1;
          const cx2 = x2 - 50;
          const cy2 = y2;
          const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
          const delay = Math.max(cueTimes[conn.from] ?? 0, cueTimes[conn.to] ?? 0);
          
          return `
            <g>
              <!-- Base Connector path -->
              <path d="${pathD}" class="svg-path-bg" />
              <!-- Animated Glowing path -->
              <path id="path-${idx}" d="${pathD}" class="svg-path-fg" style="animation-delay: ${delay}s;" />
            </g>
          `;
        }).join('\n');

        // Compile captions HTML elements
        const captionsHtml = captionsJson.map((caption) => {
          const start = caption.start;
          const duration = caption.end - caption.start;
          return `
            <div class="caption-item" style="animation-name: captionFade; animation-delay: ${start}s; animation-duration: ${duration}s;">
              ${escapeHtml(caption.text)}
            </div>
          `;
        }).join('\n');

        const [compositionWidth, compositionHeight] = options.aspectRatio === '9:16'
          ? [1080, 1920]
          : options.aspectRatio === '1:1'
            ? [1080, 1080]
            : [1920, 1080];

        // Full HyperFrames HTML Composition Template
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>README Radio Explainer</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: #050507;
      width: ${compositionWidth}px;
      height: ${compositionHeight}px;
      overflow: hidden;
    }
    [data-composition-id="readme-radio"] {
      background-color: #050507;
      color: #ffffff;
      font-family: 'Geist', system-ui, sans-serif;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 64px;
      position: relative;
    }
    
    /* Dynamic ambient glows */
    .bg-glow-1 {
      position: absolute;
      top: -20%;
      left: -20%;
      width: 1000px;
      height: 1000px;
      background: radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, transparent 70%);
      pointer-events: none;
    }
    .bg-glow-2 {
      position: absolute;
      bottom: -20%;
      right: -20%;
      width: 1000px;
      height: 1000px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 24px;
      z-index: 10;
    }
    .badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      letter-spacing: 2px;
      color: #a78bfa;
      background: rgba(124, 58, 237, 0.1);
      padding: 4px 12px;
      border-radius: 9999px;
      border: 1px solid rgba(124, 58, 237, 0.2);
    }
    h1 {
      font-size: 36px;
      font-weight: 800;
      margin-top: 8px;
      background: linear-gradient(to right, #ffffff, #d8b4fe);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .main-container {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 48px;
      flex: 1;
      margin: 48px 0;
      z-index: 10;
      align-items: stretch;
    }

    .panel-left {
      grid-column: span 7;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 32px;
      padding: 32px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }
    .panel-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 1.5px;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      margin-bottom: 20px;
    }

    .canvas-area {
      position: relative;
      width: 100%;
      height: 600px;
      border-radius: 20px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.02);
    }

    .svg-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
    }

    .svg-path-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.05);
      stroke-width: 2.5;
    }

    .svg-path-fg {
      fill: none;
      stroke: #c084fc;
      stroke-width: 3;
      stroke-dasharray: 8;
      animation: dashMove 2s linear infinite;
      opacity: 0.3;
    }

    @keyframes dashMove {
      from { stroke-dashoffset: 24; }
      to { stroke-dashoffset: 0; }
    }

    .flow-particle {
      filter: drop-shadow(0 0 8px #a78bfa);
    }

    .card-item {
      position: absolute;
      width: 180px;
      height: 68px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      align-items: center;
      padding: 0 16px;
      z-index: 10;
      opacity: 0.4;
      transform: scale(1);
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    @keyframes cardHighlight {
      0% { border-color: rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); transform: scale(1); opacity: 0.4; }
      2%, 98% { border-color: #a78bfa; background: rgba(167, 139, 250, 0.08); transform: scale(1.04); opacity: 1; box-shadow: 0 0 20px rgba(167, 139, 250, 0.2); }
      100% { border-color: rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); transform: scale(1); opacity: 0.4; }
    }

    .card-num {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-weight: bold;
      font-size: 12px;
      margin-right: 12px;
      color: rgba(255,255,255,0.6);
    }
    .card-label {
      font-size: 14px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-right {
      grid-column: span 5;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 32px;
      padding: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }

    .caption-container {
      width: 100%;
      height: 300px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .caption-item {
      position: absolute;
      width: 100%;
      text-align: center;
      font-size: 38px;
      font-weight: 800;
      line-height: 1.45;
      opacity: 0;
      transform: translateY(20px);
      animation-fill-mode: forwards;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      background: linear-gradient(to right, #ffffff, #e9d5ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
    }

    @keyframes captionFade {
      0% { opacity: 0; transform: translateY(20px); }
      4%, 96% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-20px); }
    }

    footer {
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 24px;
      display: flex;
      align-items: center;
      gap: 24px;
      z-index: 10;
    }

    .progress-bar-bg {
      flex: 1;
      height: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 9999px;
      position: relative;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(to right, #7c3aed, #a78bfa);
      width: 0%;
      animation: fillProgress linear forwards;
    }

    @keyframes fillProgress {
      from { width: 0%; }
      to { width: 100%; }
    }
  </style>
</head>
<body>
 <div id="stage" data-composition-id="readme-radio" data-start="0" data-duration="${totalDuration}" data-width="${compositionWidth}" data-height="${compositionHeight}" data-track-index="0">
  <div class="bg-glow-1"></div>
  <div class="bg-glow-2"></div>

  <header>
    <div>
      <span class="badge">README RADIO (HYPERFRAMES)</span>
      <h1>${escapeHtml(repoName)}</h1>
    </div>
  </header>

  <div class="main-container">
    <div class="panel-left">
      <div class="panel-title">System Architecture</div>
      <div class="canvas-area">
        <svg class="svg-overlay">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa"/>
            </marker>
          </defs>
          ${svgLinesHtml}
        </svg>
        ${nodesHtml}
      </div>
    </div>

    <div class="panel-right">
      <div class="caption-container">
        ${captionsHtml}
      </div>
    </div>
  </div>

  <footer>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="animation-duration: ${totalDuration}s;"></div>
    </div>
  </footer>

  <audio id="narration" src="episode.wav" data-start="0" data-duration="${totalDuration}" data-track-index="1" data-volume="1"></audio>
 </div>
 <script>
   window.__timelines = window.__timelines || {};
   window.__timelines["readme-radio"] = gsap.timeline({ paused: true });
 </script>
</body>
</html>`;

        const hfIndexHtml = path.join(hyperframesTemplateDir, 'index.html');
        await fs.writeFile(hfIndexHtml, htmlContent);

        try {
          const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
          await runCommand(npxCommand, ['hyperframes', 'lint', '.'], { cwd: hyperframesTemplateDir, forwardOutput: !options.jsonProgress });
          await runCommand(npxCommand, ['hyperframes', 'render', '.', '--output', finalVideoPath], { cwd: hyperframesTemplateDir, forwardOutput: !options.jsonProgress });
          spinner.succeed('Video rendered successfully with HyperFrames!');
        } catch (err) {
          spinner.fail('Error rendering video with HyperFrames');
          console.error(err.message);
          throw err;
        }
      } else {
        // Step 4: Render via Remotion
        report('rendering', 74, 'Rendering the Remotion composition');
        spinner.start('Rendering video with Remotion...');
        const remotionPath = path.join(__dirname, '../remotion');
        
        // Use a unique public asset folder so concurrent renders never overwrite each other.
        const remotionPublicDir = path.join(remotionPath, 'public');
        const renderToken = path.basename(targetOutputDir).replace(/[^a-zA-Z0-9_-]/g, '') || `render-${Date.now()}`;
        const remotionAssetDir = path.join(remotionPublicDir, 'jobs', renderToken);
        await fs.mkdir(remotionAssetDir, { recursive: true });
        const remotionAudioPath = path.join(remotionAssetDir, 'episode.wav');
        await fs.copyFile(targetAudioPath, remotionAudioPath);

        // Copy captions, script, diagram details to a props JSON file
        const props = {
          title: repoName,
          script: scriptText,
          captions: captionsJson,
          words: wordsJson,
          cueTimes,
          beats: beatAssignments,
          readmeData,
          mermaidCode: mermaidText,
          duration: totalDuration,
          layout: layoutMap,
          connections: connections,
          audioUrl: `jobs/${renderToken}/episode.wav`,
          aspectRatio: options.aspectRatio,
        };
        const propsFile = path.join(targetOutputDir, 'input-props.json');
        await fs.writeFile(propsFile, JSON.stringify(props, null, 2));

        try {
          const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
          await runCommand(npxCommand, ['remotion', 'render', 'src/index.ts', 'Main', finalVideoPath, `--props=${propsFile}`], {
            cwd: remotionPath,
            forwardOutput: !options.jsonProgress,
          });
          spinner.succeed('Video rendered successfully with Remotion!');
        } catch (err) {
          spinner.fail('Error rendering video with Remotion');
          console.error(err.message);
          throw err;
        } finally {
          await fs.rm(remotionAssetDir, { recursive: true, force: true });
        }
      }

      const manifest = {
        version: 1,
        repository: repoName,
        engine: options.engine,
        tone: options.tone,
        aspectRatio: options.aspectRatio,
        duration: totalDuration,
        generatedAt: new Date().toISOString(),
        files: ['explainer.mp4', 'episode.wav', 'captions.srt', 'captions.vtt', 'captions.json', 'words.json', 'script.txt', 'architecture.mermaid'],
      };
      await fs.writeFile(path.join(targetOutputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      report('complete', 100, 'Explainer video is ready');
      console.log(`\nDone! Output saved to: ${targetOutputDir}`);
    } catch (error) {
      spinner?.fail('An error occurred during generation');
      report('failed', 100, error.message || 'Generation failed');
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
