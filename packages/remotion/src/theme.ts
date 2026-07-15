export const theme = {
  canvas: "#f6f5f4",
  surface: "#ffffff",
  ink: "#000000",
  inkSecondary: "#31302e",
  inkMuted: "#615d59",
  inkFaint: "#a39e98",
  hairline: "#e6e6e6",

  primary: "#0075de",
  primaryActive: "#005bab",
  secondary: "#213183",
  onPrimary: "#ffffff",

  sticker: {
    sky: "#62aef0",
    purple: "#d6b6f6",
    purpleDeep: "#391c57",
    pink: "#ff64c8",
    orange: "#dd5b00",
    orangeDeep: "#793400",
    teal: "#2a9d99",
    green: "#1aae39",
    brown: "#523410",
  },

  rounded: {
    xs: 4,
    sm: 5,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  shadow: {
    soft: "rgba(0,0,0,0.01) 0 0.175px 1.041px, rgba(0,0,0,0.02) 0 0.8px 2.925px, rgba(0,0,0,0.027) 0 2.025px 7.847px, rgba(0,0,0,0.04) 0 4px 18px",
    elevated: "rgba(0,0,0,0.01) 0 0.175px 1.041px, rgba(0,0,0,0.02) 0 0.8px 2.925px, rgba(0,0,0,0.027) 0 2.025px 7.847px, rgba(0,0,0,0.04) 0 4px 18px, rgba(0,0,0,0.05) 0 23px 52px",
  },

  easing: {
    soft: [0.16, 1, 0.3, 1] as [number, number, number, number],
    swift: [0.22, 1, 0.36, 1] as [number, number, number, number],
    decel: [0, 0, 0.2, 1] as [number, number, number, number],
  },

  spring: {
    gentle: { damping: 18, stiffness: 90, mass: 1 },
    snappy: { damping: 14, stiffness: 140, mass: 1 },
    camera: { damping: 26, stiffness: 70, mass: 1.2 },
  },

  type: {
    display1: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 64, fontWeight: 700, lineHeight: 1.0, letterSpacing: -2.125 },
    display2: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 54, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1.875 },
    heading1: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 40, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 },
    heading2: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 26, fontWeight: 700, lineHeight: 1.23, letterSpacing: -0.625 },
    heading3: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.27, letterSpacing: -0.25 },
    title: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.125 },
    bodyMd: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 },
    bodySm: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 15, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0 },
    button: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 16, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0 },
    caption: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 14, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0 },
    eyebrow: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 12, fontWeight: 600, lineHeight: 1.33, letterSpacing: 0.125 },
    mono: { fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 13, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0.05 },
  },
} as const;

export type NodeKind = "service" | "datastore" | "client" | "queue" | "external";

export const nodeAccent: Record<NodeKind, { color: string; bg: string; icon: string }> = {
  service: { color: theme.sticker.sky, bg: "rgba(98,174,240,0.12)", icon: "cpu" },
  datastore: { color: theme.sticker.teal, bg: "rgba(42,157,153,0.12)", icon: "db" },
  client: { color: theme.sticker.green, bg: "rgba(26,174,57,0.12)", icon: "user" },
  queue: { color: theme.sticker.pink, bg: "rgba(255,100,200,0.12)", icon: "queue" },
  external: { color: theme.sticker.orange, bg: "rgba(221,91,0,0.12)", icon: "cloud" },
};

export function inferNodeKind(label: string): NodeKind {
  const l = label.toLowerCase();
  if (/(db|database|store|cache|sql|postgres|redis)/.test(l)) return "datastore";
  if (/(user|client|browser|app|frontend|ui)/.test(l)) return "client";
  if (/(queue|broker|bus|stream|kafka|topic)/.test(l)) return "queue";
  if (/(github|external|cloud|web|s3|provider|third)/.test(l)) return "external";
  return "service";
}
