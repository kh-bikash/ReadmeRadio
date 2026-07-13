#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { generateScriptAndDiagram } from './llm.js';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Matches every Mermaid flowchart node-shape wrapper, most-specific first,
// so e.g. `X((Label))` isn't mistaken for `X(` + stray text.
const NODE_SHAPE_REGEX =
  /([a-zA-Z0-9_-]+)(?:\(\(([^)]+)\)\)|\(\[([^\]]+)\]\)|\[\[([^\]]+)\]\]|\[\(([^)]+)\)\]|\{\{([^}]+)\}\}|\[\/([^\]/]+)\/\]|\[\\([^\]\\]+)\\\]|\(([^)]+)\)|\{([^}]+)\}|\[([^\]]+)\])/g;

function cleanLabel(text) {
  return text.trim().replace(/^["']|["']$/g, "");
}

function parseMermaid(code) {
  const lines = code.split(/[\r\n;]+/);
  const nodesList = [];
  const connectionsList = [];
  const skipPrefixes = ['graph', 'flowchart', 'subgraph', 'end', 'classDef', 'class ', 'style ', 'click '];

  const addNode = (id, label) => {
    if (!nodesList.some((n) => n.id === id)) {
      nodesList.push({ id, label: cleanLabel(label) });
    }
  };

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line || skipPrefixes.some((p) => line.startsWith(p))) continue;

    // Extract node declarations in any shape: A[Label], B(Label), C{Label},
    // D((Label)), E([Label]), F[[Label]], G{{Label}}, etc.
    let match;
    NODE_SHAPE_REGEX.lastIndex = 0;
    while ((match = NODE_SHAPE_REGEX.exec(line)) !== null) {
      const id = match[1];
      const label = match.slice(2).find((g) => g !== undefined) || id;
      addNode(id, label);
    }

    // Replace shape wrappers with the bare id, and drop edge labels
    // (-->|Text|) so only arrows and ids remain for connection parsing.
    const cleanLine = line
      .replace(NODE_SHAPE_REGEX, (_m, id) => id)
      .replace(/\|[^|]*\|/g, "");

    const arrowRegex = /-{1,3}>|={1,3}>|-\.+>/g;
    const parts = cleanLine.split(arrowRegex).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const from = parts[i];
      const to = parts[i + 1];
      if (/^[a-zA-Z0-9_-]+$/.test(from) && /^[a-zA-Z0-9_-]+$/.test(to)) {
        connectionsList.push({ from, to });
        addNode(from, from);
        addNode(to, to);
      }
    }
  }

  return { nodes: nodesList, connections: connectionsList };
}

// Layout coordinate calculator (topological BFS layered-graph layout)
function calculateLayout(nodes, connections) {
  const colMap = {};
  const inDegree = {};
  
  for (const node of nodes) {
    colMap[node.id] = 0;
    inDegree[node.id] = 0;
  }
  
  for (const conn of connections) {
    inDegree[conn.to] = (inDegree[conn.to] || 0) + 1;
  }
  
  const queue = [];
  for (const node of nodes) {
    if (inDegree[node.id] === 0) {
      queue.push({ id: node.id, depth: 0 });
    }
  }
  
  if (queue.length === 0 && nodes.length > 0) {
    queue.push({ id: nodes[0].id, depth: 0 });
  }
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    colMap[id] = Math.max(colMap[id], depth);
    
    const children = connections.filter(c => c.from === id).map(c => c.to);
    for (const child of children) {
      queue.push({ id: child, depth: depth + 1 });
    }
  }
  
  const cols = {};
  for (const node of nodes) {
    const col = colMap[node.id] || 0;
    if (!cols[col]) cols[col] = [];
    cols[col].push(node);
  }
  
  const layout = {};
  const totalCols = Object.keys(cols).length;
  
  const width = 640;  // Width of graph area
  const height = 480; // Height of graph area
  const colWidth = width / Math.max(totalCols - 1, 1);
  
  Object.keys(cols).forEach((colKey) => {
    const col = parseInt(colKey, 10);
    const colNodes = cols[col];
    const rowHeight = height / (colNodes.length + 1);
    
    colNodes.forEach((node, rowIdx) => {
      layout[node.id] = {
        id: node.id,
        label: node.label,
        x: 80 + col * colWidth, // Offset slightly
        y: rowHeight * (rowIdx + 1),
        col: col,
        row: rowIdx
      };
    });
  });
  
  return layout;
}

program
  .name('readme-radio')
  .description('Turn any GitHub repository into an explainer video')
  .argument('<repository>', 'GitHub repository URL or owner/repo (e.g., pallets/flask)')
  .option('-e, --engine <engine>', 'Rendering engine: remotion or hyperframes', 'remotion')
  .option('-o, --output-dir <outputDir>', 'Output directory for all generated assets', '.')
  .action(async (repository, options) => {
    let repoName = repository;
    if (repository.includes('github.com/')) {
      repoName = repository.split('github.com/')[1];
    }
    
    const targetOutputDir = path.resolve(options.outputDir);
    await fs.mkdir(targetOutputDir, { recursive: true });

    const spinner = ora(`Analyzing repository: ${repoName}...`).start();

    try {
      // Step 1: Fetch README
      spinner.text = `Fetching README for ${repoName}...`;
      const readmeUrl = `https://raw.githubusercontent.com/${repoName}/main/README.md`;
      let readmeContent = '';
      try {
        const response = await axios.get(readmeUrl);
        readmeContent = response.data;
      } catch (e) {
        // Fallback to master
        const fallbackUrl = `https://raw.githubusercontent.com/${repoName}/master/README.md`;
        const response = await axios.get(fallbackUrl);
        readmeContent = response.data;
      }

      spinner.succeed(`Fetched README for ${repoName}`);
      console.log('README length:', readmeContent.length);

      // Step 2: Generate Script via GLM
      spinner.start('Writing script with AI...');
      const responseData = await generateScriptAndDiagram(readmeContent, repoName);
      
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

      // Step 3: Audio Generation via Python Bridge
      spinner.start('Synthesizing voiceover and generating captions...');
      const pythonScriptPath = path.join(__dirname, 'generate_audio.py');
      const pythonExe = await getPythonExecutable();
      
      const audioWavName = 'episode.wav';
      const captionsSrtName = 'captions.srt';
      const targetAudioPath = path.join(targetOutputDir, audioWavName);
      const targetSrtPath = path.join(targetOutputDir, captionsSrtName);

      const cmd = `"${pythonExe}" "${pythonScriptPath}" --input "${scriptPath}" --output-audio "${targetAudioPath}" --output-srt "${targetSrtPath}"`;
      
      await execAsync(cmd);
      spinner.succeed('Audio and captions ready');

      // Parse captions
      const srtContent = await fs.readFile(targetSrtPath, 'utf8');
      const captionsJson = parseSRT(srtContent);
      const totalDuration = captionsJson.length > 0 ? captionsJson[captionsJson.length - 1].end : 60;

      // Parse Mermaid & Calculate Layout
      const { nodes, connections } = parseMermaid(mermaidText);
      const layoutMap = calculateLayout(nodes, connections);

      const finalVideoPath = path.join(targetOutputDir, 'explainer.mp4');

      if (options.engine === 'hyperframes') {
        // Step 4: Render via HyperFrames
        spinner.start('Rendering video with HyperFrames...');
        const hyperframesTemplateDir = path.join(__dirname, '../hyperframes');
        await fs.mkdir(hyperframesTemplateDir, { recursive: true });
        
        // Copy audio wav to hyperframes
        const hfAudioPath = path.join(hyperframesTemplateDir, 'episode.wav');
        await fs.copyFile(targetAudioPath, hfAudioPath);
        
        // Calculate highlighted intervals
        const nodeDuration = totalDuration / (nodes.length || 1);
        
        // Compile nodes HTML elements
        const nodesHtml = Object.values(layoutMap).map((node, i) => {
          const delay = i * nodeDuration;
          return `
            <div class="card-item" style="left: ${node.x}px; top: ${node.y}px; animation-name: cardHighlight; animation-delay: ${delay}s; animation-duration: ${nodeDuration}s;">
              <div class="card-num">${i + 1}</div>
              <div class="card-label">${node.label}</div>
            </div>
          `;
        }).join('\n');

        // Compile connecting lines SVG
        // Nodes have dimensions approx 200px wide, 80px high
        const cardW = 180;
        const cardH = 68;
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
          const delay = idx * (totalDuration / (connections.length || 1));
          
          return `
            <g>
              <!-- Base Connector path -->
              <path d="${pathD}" class="svg-path-bg" />
              <!-- Animated Glowing path -->
              <path id="path-${idx}" d="${pathD}" class="svg-path-fg" style="animation-delay: ${delay}s;" />
              <!-- Native Traveling Particle -->
              <circle r="5" fill="#a78bfa" class="flow-particle" style="animation-delay: ${delay}s;">
                <animateMotion dur="3s" repeatCount="indefinite" path="${pathD}" />
              </circle>
            </g>
          `;
        }).join('\n');

        // Compile captions HTML elements
        const captionsHtml = captionsJson.map((caption) => {
          const start = caption.start;
          const duration = caption.end - caption.start;
          return `
            <div class="caption-item" style="animation-name: captionFade; animation-delay: ${start}s; animation-duration: ${duration}s;">
              ${caption.text.replace(/"/g, '&quot;')}
            </div>
          `;
        }).join('\n');

        // Full HyperFrames HTML Composition Template
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>README Radio Explainer</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: #050507;
      color: #ffffff;
      font-family: 'Outfit', sans-serif;
      width: 1920px;
      height: 1080px;
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
<body id="stage" data-duration="${totalDuration}">
  <div class="bg-glow-1"></div>
  <div class="bg-glow-2"></div>

  <header>
    <div>
      <span class="badge">README RADIO (HYPERFRAMES)</span>
      <h1>${repoName}</h1>
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

  <audio src="episode.wav" autoplay></audio>
</body>
</html>`;

        const hfIndexHtml = path.join(hyperframesTemplateDir, 'index.html');
        await fs.writeFile(hfIndexHtml, htmlContent);

        try {
          // Render HyperFrames composition
          const hfRenderCmd = `npx hyperframes render . -o "${finalVideoPath}"`;
          await execAsync(hfRenderCmd, { cwd: hyperframesTemplateDir });
          spinner.succeed('Video rendered successfully with HyperFrames!');
        } catch (err) {
          spinner.fail('Error rendering video with HyperFrames');
          console.error(err.message);
          throw err;
        }
      } else {
        // Step 4: Render via Remotion
        spinner.start('Rendering video with Remotion...');
        const remotionPath = path.join(__dirname, '../remotion');
        
        // Copy audio to Remotion public directory
        const remotionPublicDir = path.join(remotionPath, 'public');
        await fs.mkdir(remotionPublicDir, { recursive: true });
        const remotionAudioPath = path.join(remotionPublicDir, 'episode.wav');
        await fs.copyFile(targetAudioPath, remotionAudioPath);

        // Copy captions, script, diagram details to a props JSON file
        const props = {
          title: repoName,
          script: scriptText,
          captions: captionsJson,
          mermaidCode: mermaidText,
          duration: totalDuration,
          layout: layoutMap,
          connections: connections,
          audioUrl: 'episode.wav'
        };
        const propsFile = path.join(remotionPublicDir, 'input-props.json');
        await fs.writeFile(propsFile, JSON.stringify(props, null, 2));

        try {
          // Render Main composition in Remotion
          const remotionRenderCmd = `npx remotion render src/index.ts Main "${finalVideoPath}" --props=public/input-props.json`;
          await execAsync(remotionRenderCmd, { cwd: remotionPath });
          spinner.succeed('Video rendered successfully with Remotion!');
        } catch (err) {
          spinner.fail('Error rendering video with Remotion');
          console.error(err.message);
          throw err;
        }
      }

      console.log(`\nDone! Output saved to: ${targetOutputDir}`);
    } catch (error) {
      spinner.fail('An error occurred during generation');
      console.error(error.stack || error.message);
    }
  });

program.parse(process.argv);
