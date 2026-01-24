import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing
} from "remotion";

export type SceneInput = {
  narration: string;
  subtitle: string;
  imagePath: string;
  audioPath: string;
  durationInSeconds: number;
};

export type ShortFormProps = {
  scenes: SceneInput[];
  title?: string;
  bgmPath?: string;
  commentPrompt?: string;
};

export const calculateShortFormDuration = ({
  props,
  fps
}: {
  props: ShortFormProps;
  fps: number;
}) => {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const pauseFrames = Math.round(0.1 * safeFps);
  const transitionFrames = Math.round(0.3 * safeFps);
  const endCardFrames = Math.round(2 * safeFps);
  const frames = props.scenes.reduce((total, scene) => {
    const duration = Number.isFinite(scene.durationInSeconds)
      ? scene.durationInSeconds
      : 1;
    return (
      total + Math.ceil(duration * safeFps) + pauseFrames + transitionFrames
    );
  }, 0);
  return Math.max(frames + endCardFrames, safeFps * 3);
};

const Scene = ({
  scene,
  durationInFrames,
  transitionFrames,
  index,
  narrationFrames,
  leadFrames
}: {
  scene: SceneInput;
  durationInFrames: number;
  transitionFrames: number;
  index: number;
  narrationFrames: number;
  leadFrames: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(
    frame,
    [0, durationInFrames],
    [1, 1.08],
    {
      easing: Easing.out(Easing.quad),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  const panX = interpolate(
    frame,
    [0, durationInFrames],
    index % 2 === 0 ? [0, -30] : [0, 30],
    {
      easing: Easing.out(Easing.quad),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  const panY = interpolate(
    frame,
    [0, durationInFrames],
    index % 2 === 0 ? [0, 20] : [0, -20],
    {
      easing: Easing.out(Easing.quad),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  const fadeIn = interpolate(frame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - transitionFrames, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const subtitleWords = scene.subtitle.split(/\s+/).filter(Boolean);
  const timingFrame = Math.min(
    narrationFrames,
    Math.max(0, frame + leadFrames)
  );
  const revealCount = Math.max(
    1,
    Math.ceil((timingFrame / narrationFrames) * subtitleWords.length)
  );
  const revealed = subtitleWords.slice(0, revealCount);

  return (
    <AbsoluteFill style={{ backgroundColor: "black", opacity }}>
      <Img
        src={staticFile(scene.imagePath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "0 80px",
          transform: "translateY(-170px)",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)"
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.2,
            fontFamily: "Pretendard, NanumSquare, sans-serif",
            textAlign: "center",
            padding: "16px 28px",
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.6)",
            border: "3px solid rgba(255,255,255,0.85)",
            boxShadow: "0 0 22px rgba(255,255,255,0.5)",
            textShadow:
              "0 6px 18px rgba(0,0,0,0.6), 0 0 10px rgba(255,255,255,0.5)"
          }}
        >
          {revealed.map((word, wordIndex) => {
            const highlight = /(칼퇴|치트키|1초)/.test(word);
            const mixedColor =
              wordIndex % 2 === 0 ? "#ffffff" : "#ffff00";
            return (
              <span
                key={`${word}-${wordIndex}`}
                style={{ color: highlight ? "#ffff00" : mixedColor }}
              >
                {word}
                {wordIndex < revealed.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const buildNarrationWindows = (
  scenes: SceneInput[],
  fps: number,
  pauseFrames: number,
  transitionFrames: number
) => {
  const windows: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  scenes.forEach((scene) => {
    const duration = Number.isFinite(scene.durationInSeconds)
      ? scene.durationInSeconds
      : 1;
    const durationInFrames =
      Math.ceil(duration * fps) + pauseFrames + transitionFrames;
    windows.push({
      start: cursor + pauseFrames,
      end: cursor + durationInFrames
    });
    cursor += durationInFrames - transitionFrames;
  });
  return windows;
};

const BgmTrack = ({
  scenes,
  bgmPath,
  pauseFrames,
  transitionFrames
}: {
  scenes: SceneInput[];
  bgmPath: string;
  pauseFrames: number;
  transitionFrames: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const windows = buildNarrationWindows(
    scenes,
    fps,
    pauseFrames,
    transitionFrames
  );
  const isNarrating = windows.some(
    (window) => frame >= window.start && frame <= window.end
  );
  const volume = isNarrating ? 0.2 : 0.35;
  return <Audio src={staticFile(bgmPath)} volume={volume} loop />;
};

export const ShortForm = ({
  scenes,
  title,
  bgmPath,
  commentPrompt
}: ShortFormProps) => {
  const { fps } = useVideoConfig();
  let startFrame = 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const pauseFrames = Math.round(0.1 * safeFps);
  const transitionFrames = Math.round(0.3 * safeFps);
  const endCardFrames = Math.round(2 * safeFps);
  const leadFrames = Math.round(0.1 * safeFps);

  return (
    <AbsoluteFill>
      {bgmPath ? (
        <BgmTrack
          scenes={scenes}
          bgmPath={bgmPath}
          pauseFrames={pauseFrames}
          transitionFrames={transitionFrames}
        />
      ) : null}
      {title ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-start",
            alignItems: "center",
            paddingTop: 80,
            textAlign: "center"
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              fontFamily: "Pretendard, NanumSquare, sans-serif",
              color: "#ffffff",
              textShadow: "0 6px 18px rgba(0,0,0,0.7)"
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      ) : null}
      {scenes.map((scene, index) => {
        const duration = Number.isFinite(scene.durationInSeconds)
          ? scene.durationInSeconds
          : 1;
        const narrationFrames = Math.max(1, Math.ceil(duration * safeFps));
        const durationInFrames = Math.max(
          1,
          narrationFrames + pauseFrames + transitionFrames
        );
        const sequence = (
          <Sequence
            key={`${scene.subtitle}-${index}`}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <Scene
              scene={scene}
              durationInFrames={durationInFrames}
              transitionFrames={transitionFrames}
              index={index}
              narrationFrames={narrationFrames}
              leadFrames={leadFrames}
            />
            <Sequence
              from={pauseFrames}
              durationInFrames={Math.max(1, durationInFrames - pauseFrames)}
            >
              <Audio src={staticFile(scene.audioPath)} />
            </Sequence>
          </Sequence>
        );
        startFrame += durationInFrames - transitionFrames;
        return sequence;
      })}
      {commentPrompt ? (
        <Sequence from={startFrame} durationInFrames={endCardFrames}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              padding: "0 100px",
              backgroundColor: "rgba(0,0,0,0.4)"
            }}
          >
            <div
              style={{
                fontSize: 92,
                fontWeight: 900,
                fontFamily: "Pretendard, NanumSquare, sans-serif",
                color: "#ffff00",
                textShadow:
                  "0 8px 20px rgba(0,0,0,0.8), 0 0 18px rgba(255,255,0,0.8)"
              }}
            >
              {commentPrompt}
            </div>
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
