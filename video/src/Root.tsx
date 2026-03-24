import { Composition } from "remotion";
import { PropertyReel, type PropertyReelProps } from "./PropertyReel";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PropertyReel"
        component={PropertyReel}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={FPS * 25}
        defaultProps={{
          photos: [],
          price: "USD 150.000",
          address: "Montevideo, Uruguay",
          operationType: "sale" as const,
          bedrooms: 3,
          bathrooms: 2,
          areaM2: 120,
          agentName: "Agente",
          agentPhone: "+598 99 123 456",
          musicUrl: null,
        } satisfies PropertyReelProps}
      />
    </>
  );
};
