export interface DiagramNode { id: string; label: string }
export interface DiagramConnection { from: string; to: string }
export interface LayoutNode extends DiagramNode { x: number; y: number; col: number; row: number }
export interface CaptionCue { start: number; end: number; text: string }
export function parseMermaid(code: string): { nodes: DiagramNode[]; connections: DiagramConnection[] };
export function calculateLayout(nodes: DiagramNode[], connections: DiagramConnection[], options?: { width?: number; height?: number; cardWidth?: number; cardHeight?: number; padding?: number }): Record<string, LayoutNode>;
export function deriveNodeCueTimes(nodes: DiagramNode[], captions: CaptionCue[], duration: number): Record<string, number>;
