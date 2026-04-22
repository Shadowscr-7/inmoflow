import { Composition } from "remotion";
import { PropertyReel, type PropertyReelProps } from "./PropertyReel";
import { PropertyReelV2, type PropertyReelV2Props } from "./PropertyReelV2";

const FPS = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const V1 = PropertyReel as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const V2 = PropertyReelV2 as any;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* V1 — kept for backward compatibility */}
      <Composition
        id="PropertyReel"
        component={V1}
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

      {/* V2 — TTS + subtítulos + transiciones únicas + música ambient */}
      <Composition
        id="PropertyReelV2"
        component={V2}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={FPS * 30}
        defaultProps={{
          photos: [],
          price: "USD 150.000",
          address: "Montevideo, Uruguay",
          operationType: "sale" as const,
          bedrooms: 3,
          bathrooms: 2,
          areaM2: 120,
          hasGarage: false,
          agentName: "Agente",
          agentPhone: "+598 99 123 456",
          audioDataUrl: null,
          musicDataUrl: null,
          subtitleChunks: [],
          voiceGender: "female" as const,
        } satisfies PropertyReelV2Props}
      />
    </>
  );
};
