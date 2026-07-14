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
