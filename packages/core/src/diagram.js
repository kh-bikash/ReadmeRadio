const NODE_SHAPE_REGEX =
  /([a-zA-Z0-9_-]+)(?:\(\(([^)]+)\)\)|\(\[([^\]]+)\]\)|\[\[([^\]]+)\]\]|\[\(([^)]+)\)\]|\{\{([^}]+)\}\}|\[\/([^\]/]+)\/\]|\[\\([^\]\\]+)\\\]|\(([^)]+)\)|\{([^}]+)\}|\[([^\]]+)\])/g;

/** @param {string} value */
function cleanLabel(value) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/<br\s*\/?>/gi, " ");
}

/** @param {string} code */
export function parseMermaid(code) {
  const nodes = [];
  const connections = [];
  const nodeIds = new Set();
  const connectionIds = new Set();
  const skipPrefixes = ["graph", "flowchart", "subgraph", "end", "classDef", "class ", "style ", "click ", "linkStyle"];

  const addNode = (id, label) => {
    if (!nodeIds.has(id)) {
      nodeIds.add(id);
      nodes.push({ id, label: cleanLabel(label || id) });
    }
  };

  for (const rawLine of String(code || "").split(/[\r\n;]+/)) {
    const line = rawLine.trim();
    if (!line || skipPrefixes.some((prefix) => line.startsWith(prefix))) continue;

    NODE_SHAPE_REGEX.lastIndex = 0;
    let match;
    while ((match = NODE_SHAPE_REGEX.exec(line)) !== null) {
      addNode(match[1], match.slice(2).find((group) => group !== undefined) || match[1]);
    }

    NODE_SHAPE_REGEX.lastIndex = 0;
    const cleanLine = line
      .replace(NODE_SHAPE_REGEX, (_match, id) => id)
      .replace(/\|[^|]*\|/g, "")
      .replace(/--[^-]+-->/g, "-->");
    const parts = cleanLine.split(/-{1,3}>|={1,3}>|-\.+>/g).map((part) => part.trim()).filter(Boolean);

    for (let index = 0; index < parts.length - 1; index += 1) {
      const from = parts[index];
      const to = parts[index + 1];
      if (!/^[a-zA-Z0-9_-]+$/.test(from) || !/^[a-zA-Z0-9_-]+$/.test(to)) continue;
      const key = `${from}->${to}`;
      if (!connectionIds.has(key)) {
        connectionIds.add(key);
        connections.push({ from, to });
      }
      addNode(from, from);
      addNode(to, to);
    }
  }

  return { nodes, connections };
}

/**
 * Cycle-safe layered layout. Cyclic/unreachable nodes are placed in a final
 * column rather than repeatedly enqueued.
 * @param {{id:string,label:string}[]} nodes
 * @param {{from:string,to:string}[]} connections
 * @param {{width?:number,height?:number,cardWidth?:number,cardHeight?:number,padding?:number}} [options]
 */
export function calculateLayout(nodes, connections, options = {}) {
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const cardWidth = options.cardWidth ?? 150;
  const cardHeight = options.cardHeight ?? 58;
  const padding = options.padding ?? 24;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const indegree = Object.fromEntries(nodes.map((node) => [node.id, 0]));
  const depth = Object.fromEntries(nodes.map((node) => [node.id, 0]));
  const outgoing = Object.fromEntries(nodes.map((node) => [node.id, []]));

  for (const connection of connections) {
    if (!nodeMap.has(connection.from) || !nodeMap.has(connection.to)) continue;
    indegree[connection.to] += 1;
    outgoing[connection.from].push(connection.to);
  }

  const queue = nodes.filter((node) => indegree[node.id] === 0).map((node) => node.id);
  const visited = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const child of outgoing[id]) {
      depth[child] = Math.max(depth[child], depth[id] + 1);
      indegree[child] -= 1;
      if (indegree[child] === 0) queue.push(child);
    }
  }

  const maxAcyclicDepth = Math.max(0, ...Object.values(depth));
  for (const node of nodes) {
    if (!visited.has(node.id)) depth[node.id] = maxAcyclicDepth + 1;
  }

  const usableWidth = Math.max(1, width - cardWidth - padding * 2);
  const usableHeight = Math.max(1, height - cardHeight - padding * 2);
  const minimumGap = 18;
  const maxColumns = Math.max(1, Math.min(nodes.length, Math.floor((width - padding * 2 + minimumGap) / (cardWidth + minimumGap))));
  const rowCount = Math.max(1, Math.ceil(nodes.length / maxColumns));
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const orderedNodes = [...nodes].sort((left, right) => depth[left.id] - depth[right.id] || originalOrder.get(left.id) - originalOrder.get(right.id));
  const layout = {};

  orderedNodes.forEach((node, index) => {
    const columnIndex = index % maxColumns;
    const rowIndex = Math.floor(index / maxColumns);
    const x = padding + (maxColumns === 1 ? usableWidth / 2 : (columnIndex / (maxColumns - 1)) * usableWidth);
    const y = padding + (rowCount === 1 ? usableHeight / 2 : (rowIndex / (rowCount - 1)) * usableHeight);
    layout[node.id] = { ...node, x, y, col: columnIndex, row: rowIndex };
  });

  return layout;
}

/**
 * Find a useful seek point for each node by matching label keywords against
 * caption text. Falls back to an even distribution when narration does not
 * contain a recognizable label.
 * @param {{id:string,label:string}[]} nodes
 * @param {{start:number,end:number,text:string}[]} captions
 * @param {number} duration
 */
export function deriveNodeCueTimes(nodes, captions, duration) {
  const cues = {};
  const usedTimes = new Set();
  nodes.forEach((node, index) => {
    const tokens = node.label.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    let best = null;
    let bestScore = 0;
    for (const caption of captions) {
      const text = caption.text.toLowerCase();
      const score = tokens.reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);
      if (score > bestScore && !usedTimes.has(caption.start)) {
        best = caption;
        bestScore = score;
      }
    }
    const fallback = nodes.length <= 1 ? 0 : (index / nodes.length) * Math.max(0, duration);
    cues[node.id] = best ? best.start : fallback;
    if (best) usedTimes.add(best.start);
  });
  return cues;
}
