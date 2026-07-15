import "./index.css";
import { Composition, getInputProps } from "remotion";
import { MainVideo } from "./MainVideo";
import type { AdvancedMainVideoProps } from "./MainVideo";

export interface CaptionItem {
  index?: number;
  start: number;
  end: number;
  text: string;
}

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps() as Partial<AdvancedMainVideoProps>;

  const fps = 30;
  const durationInSeconds = inputProps.duration || 10;
  const durationInFrames = Math.ceil(durationInSeconds * fps);
  const dimensions = inputProps.aspectRatio === "9:16"
    ? { width: 720, height: 1280 }
    : inputProps.aspectRatio === "1:1"
      ? { width: 1080, height: 1080 }
      : { width: 1280, height: 720 };
  const defaultProps: AdvancedMainVideoProps = {
    title: "kh-bikash/ReadmeRadio",
    script: "Welcome to Readme Radio! Let's explain how it works.",
    captions: [
      { start: 0.0, end: 2.0, text: "Welcome to Readme Radio!" },
      { start: 2.0, end: 5.0, text: "Let's explain how this project works." },
    ],
    words: [
      { word: "Welcome", start: 0.0, end: 0.4 },
      { word: "to", start: 0.45, end: 0.5 },
      { word: "Readme", start: 0.6, end: 1.1 },
      { word: "Radio!", start: 1.2, end: 1.6 },
      { word: "Let's", start: 2.0, end: 2.3 },
      { word: "explain", start: 2.4, end: 2.9 },
      { word: "how", start: 3.0, end: 3.3 },
      { word: "this", start: 3.4, end: 3.7 },
      { word: "project", start: 3.8, end: 4.3 },
      { word: "works.", start: 4.4, end: 5.0 },
    ],
    cueTimes: { cli: 0.5, llm: 2.0, tts: 3.5, remotion: 4.0 },
    beats: [
      {
        id: "b1", kind: "hook", title: "Welcome", narration: "Welcome to Readme Radio!",
        start: 0, end: 2, startFrame: 0, endFrame: 60, matched: true,
      },
      {
        id: "b2", kind: "how_it_works", title: "How it works", narration: "Let's explain how this project works.",
        nodeIds: ["cli", "llm"], start: 2, end: 5, startFrame: 60, endFrame: 150, matched: true,
      },
    ],
    readmeData: {
      features: ["Composable command structure", "Automatic help page generation", "Lazy loading of subcommands", "Rich formatting and colors"],
      codeBlocks: [{ lang: "python", code: "import click\n\n@click.command()\n@click.option('--count', default=1)\ndef hello(count):\n    for _ in range(count):\n        click.echo('Hello!')" }],
      headers: ["Click", "Installation", "Usage"],
      description: "A Python package for creating beautiful command line interfaces.",
    },
    mermaidCode: "graph TD\n  User --> CLI\n  CLI --> LLM\n  CLI --> TTS\n  CLI --> Remotion",
    duration: 5.0,
    audioUrl: "episode.wav",
    aspectRatio: "16:9",
    ...inputProps,
  };

  return (
    <>
      <Composition
        id="Main"
        component={MainVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={dimensions.width}
        height={dimensions.height}
        defaultProps={defaultProps}
      />
    </>
  );
};
