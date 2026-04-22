import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from "remotion";

/* ─── Types ──────────────────────────────────────────────── */

export interface SubtitleChunk {
  text: string;
  startMs: number;
  endMs: number;
}

export interface PropertyReelV2Props {
  photos: string[];
  price: string;
  address: string;
  operationType: "sale" | "rent";
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  hasGarage: boolean | null;
  agentName: string;
  agentPhone: string;
  audioUrl: string | null;
  subtitleChunks: SubtitleChunk[];
  voiceGender: "female" | "male";
}

/* ─── Constants ──────────────────────────────────────────── */

const SLIDE_DUR = 120; // 4s at 30fps
const TRANS = 18;      // 0.6s overlap transition
const CONTACT_DUR = 120; // 4s contact screen

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/* ─── Transition definitions (5 unique types) ────────────── */

type TransitionStyle = {
  entering: (p: number) => React.CSSProperties;
  exiting: (p: number) => React.CSSProperties;
};

const TRANSITIONS: TransitionStyle[] = [
  // 0: Fade dissolve
  {
    entering: (p) => ({ opacity: p }),
    exiting: (p) => ({ opacity: 1 - p }),
  },
  // 1: Slide from right
  {
    entering: (p) => ({
      transform: `translateX(${(1 - p) * 100}%)`,
      opacity: Math.min(p * 2, 1),
    }),
    exiting: (p) => ({
      transform: `translateX(${-p * 30}%)`,
      opacity: 1 - p,
    }),
  },
  // 2: Zoom dissolve (zoom in entering)
  {
    entering: (p) => ({
      transform: `scale(${1.15 - p * 0.15})`,
      opacity: p,
    }),
    exiting: (p) => ({
      transform: `scale(${1 + p * 0.06})`,
      opacity: 1 - p,
    }),
  },
  // 3: Blur dissolve
  {
    entering: (p) => ({
      filter: `blur(${(1 - p) * 20}px)`,
      opacity: p,
    }),
    exiting: (p) => ({
      filter: `blur(${p * 20}px)`,
      opacity: 1 - p,
    }),
  },
  // 4: Slide up
  {
    entering: (p) => ({
      transform: `translateY(${(1 - p) * 70}px)`,
      opacity: p,
    }),
    exiting: (p) => ({
      transform: `translateY(${-p * 50}px)`,
      opacity: 1 - p,
    }),
  },
];

/* ─── Ken Burns directions ───────────────────────────────── */

const KB_DIRS = [
  { s0: 1.0, s1: 1.16, x0: 0, x1: 25, y0: 0, y1: -18 },
  { s0: 1.16, s1: 1.0, x0: -20, x1: 0, y0: -12, y1: 0 },
  { s0: 1.05, s1: 1.18, x0: 15, x1: -15, y0: 8, y1: -8 },
  { s0: 1.12, s1: 1.02, x0: -10, x1: 18, y0: -5, y1: 14 },
  { s0: 1.0, s1: 1.12, x0: 0, x1: -22, y0: 0, y1: 10 },
];

/* ─── PhotoSlide — Ken Burns ─────────────────────────────── */

const PhotoSlide: React.FC<{
  src: string;
  durationInFrames: number;
  kbIdx: number;
}> = ({ src, durationInFrames, kbIdx }) => {
  const frame = useCurrentFrame();
  const kb = KB_DIRS[kbIdx % KB_DIRS.length];
  const t = frame / durationInFrames;

  const scale = kb.s0 + (kb.s1 - kb.s0) * t;
  const tx = kb.x0 + (kb.x1 - kb.x0) * t;
  const ty = kb.y0 + (kb.y1 - kb.y0) * t;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
          willChange: "transform",
        }}
      />
    </AbsoluteFill>
  );
};

/* ─── TransitionSlide — applies entering/exiting animation ─ */

const TransitionSlide: React.FC<{
  transitionIdx: number;
  children: React.ReactNode;
}> = ({ transitionIdx, children }) => {
  const frame = useCurrentFrame();
  const transition = TRANSITIONS[transitionIdx % TRANSITIONS.length];

  let style: React.CSSProperties = {};

  if (frame < TRANS) {
    const p = smoothstep(interpolate(frame, [0, TRANS], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }));
    style = transition.entering(p);
  } else if (frame >= SLIDE_DUR) {
    const p = smoothstep(interpolate(frame, [SLIDE_DUR, SLIDE_DUR + TRANS], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }));
    style = transition.exiting(p);
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", ...style }}>
      {children}
    </AbsoluteFill>
  );
};

/* ─── FadeInOut wrapper ──────────────────────────────────── */

const FadeInOut: React.FC<{
  durationInFrames: number;
  fadeFrames?: number;
  children: React.ReactNode;
}> = ({ durationInFrames, fadeFrames = TRANS, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/* ─── AnimatedIn — slide-up + fade for text ─────────────── */

const AnimatedIn: React.FC<{
  delay?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const start = TRANS + delay;
  const opacity = interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = spring({
    frame: Math.max(frame - start, 0),
    fps,
    config: { damping: 18, stiffness: 200, mass: 0.8 },
    from: 0.85,
    to: 1,
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "left center",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ─── Slide overlays ─────────────────────────────────────── */

const SlideOverlay: React.FC<{
  props: PropertyReelV2Props;
  slideIndex: number;
  accentColor: string;
}> = ({ props, slideIndex, accentColor }) => {
  const frame = useCurrentFrame();
  const badge = props.operationType === "rent" ? "EN ALQUILER" : "EN VENTA";

  // Animated top accent line
  const lineWidth = interpolate(frame, [TRANS, TRANS + 25], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (slideIndex === 0) {
    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 45%, transparent 75%)",
          justifyContent: "flex-end",
          padding: "0 56px 64px",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 6,
            width: `${lineWidth}%`,
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
            borderRadius: "0 4px 4px 0",
          }}
        />

        <AnimatedIn delay={0}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: accentColor,
              color: "white",
              padding: "10px 26px",
              borderRadius: 100,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 3,
              marginBottom: 20,
              boxShadow: `0 4px 20px ${accentColor}88`,
            }}
          >
            {badge}
          </div>
        </AnimatedIn>

        <AnimatedIn delay={6}>
          <div
            style={{
              color: "white",
              fontSize: 82,
              fontWeight: 900,
              lineHeight: 1,
              textShadow: "0 4px 30px rgba(0,0,0,0.7)",
              letterSpacing: -1,
            }}
          >
            {props.price}
          </div>
        </AnimatedIn>

        {props.address && (
          <AnimatedIn delay={14}>
            <div
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: 34,
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ color: accentColor, fontSize: 32 }}>📍</span>
              {props.address}
            </div>
          </AnimatedIn>
        )}
      </AbsoluteFill>
    );
  }

  if (slideIndex === 1) {
    const specs: { icon: string; label: string }[] = [];
    if (props.bedrooms) specs.push({ icon: "🛏", label: `${props.bedrooms} Dorm.` });
    if (props.bathrooms) specs.push({ icon: "🚿", label: `${props.bathrooms} Baños` });
    if (props.areaM2) specs.push({ icon: "📐", label: `${props.areaM2} m²` });
    if (props.hasGarage) specs.push({ icon: "🚗", label: "Garage" });

    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, transparent 80%)",
          justifyContent: "flex-end",
          padding: "0 56px 64px",
        }}
      >
        <AnimatedIn delay={0}>
          <div
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Características
          </div>
        </AnimatedIn>

        <AnimatedIn delay={8}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {specs.map((s, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid rgba(255,255,255,0.22)`,
                  borderRadius: 16,
                  padding: "14px 26px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "white",
                  fontSize: 32,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 34 }}>{s.icon}</span>
                {s.label}
              </div>
            ))}
          </div>
        </AnimatedIn>
      </AbsoluteFill>
    );
  }

  // Other slides: subtle scrim + corner badge
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "35%",
          background: "linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 32,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
          borderRadius: 12,
          padding: "8px 18px",
          color: "rgba(255,255,255,0.75)",
          fontSize: 24,
          fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {slideIndex + 1} / {Math.max(1, 1)} {/* placeholder count */}
      </div>
    </AbsoluteFill>
  );
};

/* ─── Subtitle display (global frame) ───────────────────── */

const SubtitleDisplay: React.FC<{
  chunks: SubtitleChunk[];
  contentEndFrame: number;
}> = ({ chunks, contentEndFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame >= contentEndFrame || chunks.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const activeChunk = chunks.find(
    (c) => currentMs >= c.startMs && currentMs < c.endMs + 350,
  );

  if (!activeChunk) return null;

  const chunkStartFrame = Math.round((activeChunk.startMs / 1000) * fps);
  const localFrame = Math.max(frame - chunkStartFrame, 0);

  const opacity = interpolate(localFrame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 20, stiffness: 280, mass: 0.7 },
    from: 0.88,
    to: 1,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 40px 200px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.72)",
          backdropFilter: "blur(10px)",
          borderRadius: 18,
          padding: "18px 32px",
          maxWidth: "88%",
          textAlign: "center",
          opacity,
          transform: `scale(${scale})`,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 46,
            fontWeight: 700,
            lineHeight: 1.25,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            letterSpacing: 0.3,
          }}
        >
          {activeChunk.text}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ─── Contact screen ─────────────────────────────────────── */

const ContactScreen: React.FC<{
  agentName: string;
  agentPhone: string;
  accentColor: string;
}> = ({ agentName, agentPhone, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = (delay: number): React.CSSProperties => {
    const start = delay;
    const s = spring({
      frame: Math.max(frame - start, 0),
      fps,
      config: { damping: 18, stiffness: 160, mass: 0.9 },
      from: 0,
      to: 1,
    });
    const opacity = interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return {
      opacity,
      transform: `translateY(${(1 - s) * 40}px)`,
    };
  };

  const pulse = Math.sin(frame * 0.08) * 0.03 + 1;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0c0c1a 0%, #141428 50%, #0c1a20 100%)",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: 80,
      }}
    >
      {/* Decorative radial glow */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}1a 0%, transparent 65%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Avatar */}
      <div style={{ ...slideIn(8), marginBottom: 36 }}>
        <div
          style={{
            width: 148,
            height: 148,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}99 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 68,
            fontWeight: 900,
            color: "white",
            boxShadow: `0 0 50px ${accentColor}55, 0 0 0 4px ${accentColor}33`,
            transform: `scale(${pulse})`,
          }}
        >
          {agentName.charAt(0).toUpperCase()}
        </div>
      </div>

      <div style={slideIn(16)}>
        <div
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Agente Inmobiliario
        </div>
      </div>

      <div style={slideIn(24)}>
        <div
          style={{
            color: "white",
            fontSize: 60,
            fontWeight: 800,
            textAlign: "center",
            marginBottom: 14,
            textShadow: "0 2px 24px rgba(0,0,0,0.5)",
          }}
        >
          {agentName}
        </div>
      </div>

      <div style={slideIn(32)}>
        <div
          style={{
            color: accentColor,
            fontSize: 44,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 52,
            letterSpacing: 1,
          }}
        >
          📞 {agentPhone}
        </div>
      </div>

      <div style={slideIn(40)}>
        <div
          style={{
            background: accentColor,
            color: "white",
            padding: "22px 64px",
            borderRadius: 100,
            fontSize: 36,
            fontWeight: 700,
            boxShadow: `0 8px 36px ${accentColor}66`,
            letterSpacing: 0.5,
          }}
        >
          ¡Consultame ahora!
        </div>
      </div>

      {/* Bottom watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          color: "rgba(255,255,255,0.2)",
          fontSize: 20,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Contact House Inmobiliaria
      </div>
    </AbsoluteFill>
  );
};

/* ─── Main composition ───────────────────────────────────── */

export const PropertyReelV2: React.FC<PropertyReelV2Props> = (props) => {
  const { fps } = useVideoConfig();

  const photos = props.photos.length > 0 ? props.photos : [];
  const photoCount = Math.max(photos.length, 1);
  const accentColor = props.operationType === "rent" ? "#3b82f6" : "#22c55e";
  const contentEndFrame = photoCount * SLIDE_DUR; // subtitles only during photos

  return (
    <AbsoluteFill style={{ backgroundColor: "#111", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* TTS audio */}
      {props.audioUrl && <Audio src={props.audioUrl} volume={1} />}

      {/* Photo slides */}
      {photos.map((photo, i) => (
        <Sequence
          key={i}
          from={i * SLIDE_DUR}
          durationInFrames={SLIDE_DUR + TRANS}
        >
          <TransitionSlide transitionIdx={i}>
            <PhotoSlide
              src={photo}
              durationInFrames={SLIDE_DUR + TRANS}
              kbIdx={i}
            />
            <SlideOverlay
              props={props}
              slideIndex={i}
              accentColor={accentColor}
            />
          </TransitionSlide>
        </Sequence>
      ))}

      {/* Contact screen */}
      <Sequence
        from={photoCount * SLIDE_DUR}
        durationInFrames={CONTACT_DUR}
      >
        <FadeInOut durationInFrames={CONTACT_DUR} fadeFrames={TRANS}>
          <ContactScreen
            agentName={props.agentName}
            agentPhone={props.agentPhone}
            accentColor={accentColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Subtitles — outside sequences to use global frame */}
      {props.subtitleChunks.length > 0 && (
        <SubtitleDisplay
          chunks={props.subtitleChunks}
          contentEndFrame={contentEndFrame}
        />
      )}
    </AbsoluteFill>
  );
};
