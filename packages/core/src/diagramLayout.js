// Single source of truth for the diagram's virtual canvas + card size, so the
// server-side layout engine (calculateLayout) and the Remotion SVG renderer
// never disagree on connector-anchor coordinates.
export const DIAGRAM_CANVAS_WIDTH = 640;
export const DIAGRAM_CANVAS_HEIGHT = 480;
export const DIAGRAM_CARD_WIDTH = 180;
export const DIAGRAM_CARD_HEIGHT = 68;
export const DIAGRAM_PADDING = 32;
