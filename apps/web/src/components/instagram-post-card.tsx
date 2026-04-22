"use client";

import React, { forwardRef } from "react";
import { Property, API_URL } from "@/lib/api";

const CARD = 1080;

export function buildTagline(p: Property): string {
  if (p.description && p.description.trim().length > 20) {
    const clean = p.description.trim().replace(/\n+/g, " ");
    const first = clean.split(/[.!?]/)[0]?.trim() ?? "";
    if (first.length >= 10 && first.length <= 90) return first;
    if (clean.length <= 90) return clean;
    return clean.slice(0, 87) + "…";
  }
  const type = p.propertyType ?? "Propiedad";
  const op = p.operationType === "rent" ? "en alquiler" : "en venta";
  const feat = p.hasGarage ? "con cochera" : p.zone ? `en ${p.zone}` : "";
  return [type, feat, op].filter(Boolean).join(" ");
}

export function resolveImageUrl(p: Property): string | null {
  const img = (p.media ?? []).find((m) => m.kind === "image" || !m.kind);
  if (!img) return null;
  if (img.url.startsWith("http")) return img.url;
  return `${API_URL}${img.url}`;
}

export const InstagramPostCard = forwardRef<HTMLDivElement, { property: Property }>(
  ({ property: p }, ref) => {
    const isRent = p.operationType === "rent";
    const accent = isRent ? "#3b82f6" : "#22c55e";
    const accentDim = isRent ? "#3b82f644" : "#22c55e44";
    const badgeText = isRent ? "EN ALQUILER" : "EN VENTA";
    const imageUrl = resolveImageUrl(p);
    const tagline = buildTagline(p);
    const price = p.price
      ? `${p.currency ?? "USD"} ${p.price.toLocaleString("es")}`
      : "Consultar precio";

    const specs: { icon: string; value: string; label: string }[] = [];
    if (p.bedrooms) specs.push({ icon: "🛏", value: String(p.bedrooms), label: "Dorm." });
    if (p.bathrooms) specs.push({ icon: "🚿", value: String(p.bathrooms), label: "Baños" });
    if (p.areaM2) specs.push({ icon: "📐", value: String(p.areaM2), label: "m²" });
    if (p.hasGarage) specs.push({ icon: "🚗", value: "✓", label: "Cochera" });

    const address = p.address ?? p.zone ?? "";

    return (
      <div
        ref={ref}
        style={{
          width: CARD,
          height: CARD,
          position: "relative",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
          backgroundColor: "#060612",
        }}
      >
        {/* Background photo */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.5) 52%, rgba(0,0,0,0.88) 72%, rgba(0,0,0,0.97) 100%)",
          }}
        />

        {/* Left accent bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 9,
            background: `linear-gradient(to bottom, ${accent}, ${accentDim} 70%, transparent)`,
          }}
        />

        {/* Top bar */}
        <div
          style={{
            position: "absolute",
            top: 52,
            left: 56,
            right: 56,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 100,
              padding: "14px 30px",
              color: "rgba(255,255,255,0.9)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            Contact House
          </div>

          <div
            style={{
              background: accent,
              color: "white",
              padding: "16px 36px",
              borderRadius: 100,
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: 2.5,
              boxShadow: `0 6px 28px ${accentDim}`,
            }}
          >
            {badgeText}
          </div>
        </div>

        {/* Bottom content area */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0 60px 72px",
          }}
        >
          {/* Tagline */}
          <p
            style={{
              margin: "0 0 20px",
              color: "rgba(255,255,255,0.68)",
              fontSize: 33,
              fontStyle: "italic",
              fontWeight: 400,
              lineHeight: 1.35,
              letterSpacing: 0.2,
            }}
          >
            {tagline}
          </p>

          {/* Price */}
          <p
            style={{
              margin: "0 0 16px",
              color: "white",
              fontSize: 86,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2,
              textShadow: "0 4px 32px rgba(0,0,0,0.6)",
            }}
          >
            {price}
          </p>

          {/* Accent underline */}
          <div
            style={{
              width: 110,
              height: 5,
              background: accent,
              borderRadius: 4,
              marginBottom: 46,
              boxShadow: `0 0 24px ${accent}`,
            }}
          />

          {/* Specs row */}
          {specs.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 18,
                marginBottom: 40,
              }}
            >
              {specs.map((s, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.08)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 22,
                    padding: "20px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  }}
                >
                  <span style={{ fontSize: 38, lineHeight: 1 }}>{s.icon}</span>
                  <div>
                    <div
                      style={{
                        color: "white",
                        fontSize: 40,
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                    >
                      {s.value}
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 22,
                        marginTop: 4,
                        fontWeight: 500,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Address */}
          {address && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "rgba(255,255,255,0.62)",
                fontSize: 30,
              }}
            >
              <span style={{ color: accent, fontSize: 32 }}>📍</span>
              <span>{address}</span>
            </div>
          )}
        </div>

        {/* Bottom watermark */}
        <div
          style={{
            position: "absolute",
            bottom: 28,
            right: 56,
            color: "rgba(255,255,255,0.22)",
            fontSize: 22,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          inmoflow.app
        </div>
      </div>
    );
  },
);

InstagramPostCard.displayName = "InstagramPostCard";
