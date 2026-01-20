import { Composition, registerRoot } from "remotion";
import { ShortForm, calculateShortFormDuration } from "./ShortForm";

export const RemotionRoot = () => {
  return (
    <Composition
      id="ShortForm"
      component={ShortForm}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={300}
      calculateMetadata={({ props, fps }) => ({
        durationInFrames: calculateShortFormDuration({
          props,
          fps
        })
      })}
      defaultProps={{
        scenes: [],
        title: "",
        bgmPath: "",
        commentPrompt: ""
      }}
    />
  );
};

registerRoot(RemotionRoot);
