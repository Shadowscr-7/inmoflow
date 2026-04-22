#!/usr/bin/env python3
"""
Generate a simple royalty-free ambient real estate background music using Python stdlib.
Produces a WAV file with a warm chord pad progression (C major tonality).
Usage: python generate_ambient_music.py <output_wav_path> [duration_seconds]
"""
import sys
import wave
import struct
import math


SAMPLE_RATE = 22050  # Hz
CHANNELS = 1


def sine(t: float, freq: float, phase: float = 0.0) -> float:
    return math.sin(2 * math.pi * freq * t + phase)


def generate_chord_pad(
    t: float,
    chord_freqs: list[float],
    amp: float = 0.55,
) -> float:
    """Blend multiple sine waves with harmonics to create a soft pad."""
    sample = 0.0
    for freq in chord_freqs:
        # Fundamental
        sample += 0.6 * sine(t, freq)
        # 2nd harmonic (octave) — softer
        sample += 0.25 * sine(t, freq * 2, math.pi * 0.3)
        # Sub-octave — very soft
        sample += 0.15 * sine(t, freq * 0.5, math.pi * 0.6)
    # Normalize by number of partials per note
    sample = sample / (len(chord_freqs) * 1.0)
    return sample * amp


def generate(output_path: str, duration_sec: float = 35.0) -> None:
    # Chord progression (C maj → F maj → G maj → C maj), each ~25% of duration
    chords = [
        [261.63, 329.63, 392.00, 523.25],   # C maj  (C E G C)
        [349.23, 440.00, 523.25, 698.46],   # F maj  (F A C F)
        [392.00, 493.88, 587.33, 783.99],   # G maj  (G B D G)
        [261.63, 329.63, 392.00, 523.25],   # C maj  back
    ]

    total_samples = int(SAMPLE_RATE * duration_sec)
    chord_samples = total_samples // len(chords)
    fade_samples = int(SAMPLE_RATE * 1.2)     # 1.2s global fade in/out
    xfade_samples = int(SAMPLE_RATE * 0.4)    # 0.4s cross-fade between chords

    all_samples: list[int] = []

    for chord_idx, chord_freqs in enumerate(chords):
        for i in range(chord_samples):
            t = i / SAMPLE_RATE

            # Slow tremolo for warmth
            tremolo = 0.88 + 0.12 * sine(t, 0.25)

            sample = generate_chord_pad(t, chord_freqs) * tremolo

            # Per-chord cross-fade envelope
            if i < xfade_samples:
                sample *= i / xfade_samples
            elif i > chord_samples - xfade_samples:
                sample *= (chord_samples - i) / xfade_samples

            # Global fade in/out
            global_i = chord_idx * chord_samples + i
            if global_i < fade_samples:
                sample *= global_i / fade_samples
            elif global_i > total_samples - fade_samples:
                sample *= (total_samples - global_i) / fade_samples

            sample = max(-0.92, min(0.92, sample))
            all_samples.append(int(sample * 32767))

    with wave.open(output_path, "w") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(struct.pack(f"<{len(all_samples)}h", *all_samples))


if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else "ambient.wav"
    duration = float(sys.argv[2]) if len(sys.argv) > 2 else 35.0
    generate(out_path, duration)
    print(f"Generated {duration:.0f}s ambient music at {out_path}")
