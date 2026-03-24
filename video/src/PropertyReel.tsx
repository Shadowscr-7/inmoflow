import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from "remotion";

export interface PropertyReelProps {
  photos: string[];
  price: string;
  address: string;
  operationType: "sale" | "rent";
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  agentName: string;
  agentPhone: string;
  musicUrl: string | null;
}

/* ─── Ken Burns photo slide ─────────────────────────────── */
const PhotoSlide: React.FC<{
  src: string;
  durationInFrames: number;
  direction: number;
}> = ({ src, durationInFrames, direction }) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.18], {
    extrapolateRight: "clamp",
  });

  const translateX = interpolate(
    frame,
    [0, durationInFrames],
    [0, direction % 2 === 0 ? 30 : -30],
    { extrapolateRight: "clamp" }
  );

  const translateY = interpolate(
    frame,
    [0, durationInFrames],
    [0, direction % 3 === 0 ? -20 : 20],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ─── Fade transition wrapper ───────────────────────────── */
const FadeIn: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  fadeFrames?: number;
}> = ({ children, durationInFrames, fadeFrames = 12 }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/* ─── Text overlay with slide-up animation ──────────────── */
const AnimatedText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [delay, delay + 15], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ─── Info overlay on photo slides ──────────────────────── */
const PropertyInfoOverlay: React.FC<{
  props: PropertyReelProps;
  slideIndex: number;
}> = ({ props, slideIndex }) => {
  const badge = props.operationType === "rent" ? "EN ALQUILER" : "EN VENTA";
  const badgeColor = props.operationType === "rent" ? "#2196F3" : "#4CAF50";

  // Slide 0: badge + price
  if (slideIndex === 0) {
    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
          justifyContent: "flex-end",
          padding: 60,
        }}
      >
        <AnimatedText delay={10}>
          <div
            style={{
              display: "inline-block",
              background: badgeColor,
              color: "white",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 30,
            }}
          >
            {badge}
          </div>
        </AnimatedText>
        <AnimatedText delay={20}>
          <div
            style={{
              color: "white",
              fontSize: 72,
              fontWeight: 800,
              textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            $ {props.price}
          </div>
        </AnimatedText>
      </AbsoluteFill>
    );
  }

  // Slide 1: address + specs
  if (slideIndex === 1) {
    const specs: string[] = [];
    if (props.bedrooms) specs.push(`🛏 ${props.bedrooms} Dorm.`);
    if (props.bathrooms) specs.push(`🚿 ${props.bathrooms} Baños`);
    if (props.areaM2) specs.push(`📐 ${props.areaM2} m²`);

    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
          justifyContent: "flex-end",
          padding: 60,
        }}
      >
        <AnimatedText delay={10}>
          <div
            style={{
              color: "white",
              fontSize: 40,
              fontWeight: 600,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: badgeColor,
              }}
            />
            {props.address}
          </div>
        </AnimatedText>
        {specs.length > 0 && (
          <AnimatedText delay={22}>
            <div
              style={{
                display: "flex",
                gap: 32,
                marginTop: 10,
              }}
            >
              {specs.map((s, i) => (
                <div
                  key={i}
                  style={{
                    color: "white",
                    fontSize: 34,
                    fontWeight: 500,
                    background: "rgba(255,255,255,0.12)",
                    padding: "10px 24px",
                    borderRadius: 10,
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </AnimatedText>
        )}
      </AbsoluteFill>
    );
  }

  // Other slides: minimal overlay
  return null;
};

/* ─── Contact screen (final) ────────────────────────────── */
const ContactScreen: React.FC<{
  agentName: string;
  agentPhone: string;
  operationType: "sale" | "rent";
  durationInFrames: number;
}> = ({ agentName, agentPhone, operationType, durationInFrames }) => {
  const accentColor = operationType === "rent" ? "#2196F3" : "#4CAF50";

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <AnimatedText delay={5}>
        <div
          style={{
            fontSize: 44,
            color: "#aaa",
            letterSpacing: 4,
            marginBottom: 40,
            textTransform: "uppercase",
          }}
        >
          Contacto
        </div>
      </AnimatedText>

      <AnimatedText delay={15}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: accentColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
            color: "white",
            fontWeight: 700,
            marginBottom: 40,
          }}
        >
          {agentName.charAt(0).toUpperCase()}
        </div>
      </AnimatedText>

      <AnimatedText delay={22}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          {agentName}
        </div>
      </AnimatedText>

      <AnimatedText delay={30}>
        <div
          style={{
            fontSize: 44,
            color: accentColor,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 60,
          }}
        >
          {agentPhone}
        </div>
      </AnimatedText>

      <AnimatedText delay={38}>
        <div
          style={{
            background: accentColor,
            color: "white",
            padding: "20px 50px",
            borderRadius: 16,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          ¡Consultame!
        </div>
      </AnimatedText>
    </AbsoluteFill>
  );
};

/* ─── Main composition ──────────────────────────────────── */
export const PropertyReel: React.FC<PropertyReelProps> = (props) => {
  const { fps } = useVideoConfig();

  const photoDuration = Math.round(3.5 * fps); // ~105 frames at 30fps
  const contactDuration = 4 * fps; // 120 frames

  const photos = props.photos.length > 0 ? props.photos : [];
  const photoCount = Math.max(photos.length, 1);

  const totalDuration = photoCount * photoDuration + contactDuration;

  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {/* Background music */}
      {props.musicUrl && (
        <Audio src={props.musicUrl} volume={0.3} />
      )}

      {/* Photo slides with Ken Burns + overlays */}
      {photos.map((photo, i) => (
        <Sequence
          key={i}
          from={i * photoDuration}
          durationInFrames={photoDuration + 12}
        >
          <FadeIn durationInFrames={photoDuration + 12}>
            <PhotoSlide
              src={photo}
              durationInFrames={photoDuration + 12}
              direction={i}
            />
            <PropertyInfoOverlay props={props} slideIndex={i} />
          </FadeIn>
        </Sequence>
      ))}

      {/* Contact screen */}
      <Sequence
        from={photoCount * photoDuration}
        durationInFrames={contactDuration}
      >
        <FadeIn durationInFrames={contactDuration} fadeFrames={15}>
          <ContactScreen
            agentName={props.agentName}
            agentPhone={props.agentPhone}
            operationType={props.operationType}
            durationInFrames={contactDuration}
          />
        </FadeIn>
      </Sequence>
    </AbsoluteFill>
  );
};
