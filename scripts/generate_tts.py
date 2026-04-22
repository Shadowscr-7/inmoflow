#!/usr/bin/env python3
"""
Generate TTS audio and word-level subtitle chunks.
Tries Piper TTS first (offline, high quality), falls back to edge-tts.

Usage: python generate_tts.py <input_json_path>
Input JSON: {"text": "...", "voice": "female|male", "audioPath": "...", "subtitlePath": "...", "voicesDir": "..."}
Output JSON to stdout: {"success": true, "totalMs": N, "wordCount": N, "engine": "piper|edge"} or {"error": "..."}
"""
import sys
import json
import asyncio
import os
import wave
import struct


# ---------------------------------------------------------------------------
# Piper voice models (offline, ~60-80MB each, downloaded once)
# ---------------------------------------------------------------------------
PIPER_VOICES = {
    "female": {
        "name": "es_ES-sharvard-medium",
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json",
    },
    "male": {
        "name": "es_ES-davefx-medium",
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json",
    },
}

# edge-tts voices as fallback
EDGE_VOICES = {
    "female": "es-ES-ElviraNeural",
    "male": "es-ES-AlvaroNeural",
}


# ---------------------------------------------------------------------------
# Subtitle helpers
# ---------------------------------------------------------------------------

def split_sentence_words(text: str, start_ms: int, end_ms: int) -> list:
    words = text.split()
    if not words:
        return []
    dur = end_ms - start_ms
    ms_per_word = dur / len(words)
    return [
        {
            "text": w,
            "startMs": start_ms + int(i * ms_per_word),
            "endMs": start_ms + int((i + 1) * ms_per_word),
        }
        for i, w in enumerate(words)
    ]


def wav_duration_ms(wav_path: str) -> int:
    with wave.open(wav_path, "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        return int(frames / rate * 1000)


# ---------------------------------------------------------------------------
# Piper TTS
# ---------------------------------------------------------------------------

def ensure_piper_model(voice_key: str, voices_dir: str) -> tuple[str, str] | None:
    """Download voice model if needed. Returns (onnx_path, json_path) or None."""
    import urllib.request

    info = PIPER_VOICES.get(voice_key)
    if not info:
        return None

    os.makedirs(voices_dir, exist_ok=True)
    onnx_path = os.path.join(voices_dir, info["name"] + ".onnx")
    json_path = os.path.join(voices_dir, info["name"] + ".onnx.json")

    for path, url in [(onnx_path, info["onnx"]), (json_path, info["json"])]:
        if not os.path.exists(path):
            print(f"[piper] Downloading {os.path.basename(path)}...", file=sys.stderr)
            try:
                urllib.request.urlretrieve(url, path)
            except Exception as e:
                print(f"[piper] Download failed: {e}", file=sys.stderr)
                return None

    return onnx_path, json_path


def synthesize_piper(text: str, voice_key: str, wav_path: str, voices_dir: str) -> bool:
    try:
        from piper import PiperVoice
    except ImportError:
        return False

    model_paths = ensure_piper_model(voice_key, voices_dir)
    if not model_paths:
        return False

    onnx_path, json_path = model_paths
    try:
        voice = PiperVoice.load(onnx_path, config_path=json_path, use_cuda=False)
        with wave.open(wav_path, "wb") as wav_file:
            voice.synthesize(text, wav_file, sentence_silence=0.3)
        return os.path.exists(wav_path) and os.path.getsize(wav_path) > 0
    except Exception as e:
        print(f"[piper] Synthesis failed: {e}", file=sys.stderr)
        return False


def build_word_chunks_from_duration(text: str, total_ms: int) -> list:
    """Build per-word subtitle chunks with uniform timing across the full audio."""
    words = [w.strip(".,;:!?¡¿ ") for w in text.split()]
    words = [w for w in words if w]
    if not words:
        return []
    ms_per_word = total_ms / len(words)
    return [
        {
            "text": words[i],
            "startMs": int(i * ms_per_word),
            "endMs": int((i + 1) * ms_per_word),
        }
        for i in range(len(words))
    ]


# ---------------------------------------------------------------------------
# edge-tts (fallback)
# ---------------------------------------------------------------------------

async def synthesize_edge(text: str, voice_key: str, mp3_path: str) -> tuple[list, int]:
    """Returns (subtitle_chunks, total_ms)."""
    import edge_tts

    voice = EDGE_VOICES.get(voice_key, "es-ES-ElviraNeural")
    communicate = edge_tts.Communicate(text, voice, rate="-12%")
    words = []
    sentences = []

    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start_ms = chunk["offset"] // 10000
                dur_ms = chunk["duration"] // 10000
                token = chunk["text"].strip(".,;:!?¡¿ ")
                if token:
                    words.append({
                        "text": chunk["text"].strip(),
                        "startMs": start_ms,
                        "endMs": start_ms + max(dur_ms, 80),
                    })
            elif chunk["type"] == "SentenceBoundary":
                start_ms = chunk["offset"] // 10000
                dur_ms = chunk["duration"] // 10000
                sentences.append({
                    "text": chunk["text"],
                    "startMs": start_ms,
                    "endMs": start_ms + dur_ms,
                })

    if words:
        return words, words[-1]["endMs"]
    elif sentences:
        chunks = []
        for s in sentences:
            chunks.extend(split_sentence_words(s["text"], s["startMs"], s["endMs"]))
        total_ms = sentences[-1]["endMs"] if sentences else 0
        return chunks, total_ms
    return [], 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def generate(text: str, voice: str, audio_path: str, subtitle_path: str, voices_dir: str):
    used_engine = "none"
    subtitle_chunks = []
    total_ms = 0

    # --- Try Piper (offline, higher quality) ---
    wav_path = audio_path.replace(".mp3", ".wav") if audio_path.endswith(".mp3") else audio_path + ".wav"
    piper_ok = synthesize_piper(text, voice, wav_path, voices_dir)

    if piper_ok:
        try:
            # Convert WAV → MP3 via ffmpeg if available, else keep WAV
            total_ms = wav_duration_ms(wav_path)
            mp3_done = False
            try:
                import subprocess
                result = subprocess.run(
                    ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "4", audio_path],
                    capture_output=True, timeout=60,
                )
                if result.returncode == 0 and os.path.exists(audio_path):
                    mp3_done = True
            except Exception:
                pass

            if not mp3_done:
                # Remotion can handle WAV as data URL too
                import shutil
                shutil.copy(wav_path, audio_path)

            subtitle_chunks = build_word_chunks_from_duration(text, total_ms)
            used_engine = "piper"
        except Exception as e:
            print(f"[piper] Post-process error: {e}", file=sys.stderr)
            piper_ok = False
        finally:
            if os.path.exists(wav_path):
                os.unlink(wav_path)

    # --- Fallback: edge-tts ---
    if not piper_ok:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            print(json.dumps({"error": "Neither piper-tts nor edge-tts is installed"}))
            return

        mp3_path = audio_path if audio_path.endswith(".mp3") else audio_path + ".mp3"
        subtitle_chunks, total_ms = await synthesize_edge(text, voice, mp3_path)
        if mp3_path != audio_path:
            import shutil
            shutil.move(mp3_path, audio_path)
        used_engine = "edge"

    with open(subtitle_path, "w", encoding="utf-8") as f:
        json.dump(subtitle_chunks, f, ensure_ascii=False, indent=2)

    word_count = len(subtitle_chunks)
    print(json.dumps({
        "success": True,
        "totalMs": total_ms,
        "wordCount": word_count,
        "engine": used_engine,
    }))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: generate_tts.py <input_json_path>"}))
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        params = json.load(f)

    asyncio.run(generate(
        params["text"],
        params.get("voice", "female"),
        params["audioPath"],
        params["subtitlePath"],
        params.get("voicesDir", "/tmp/piper-voices"),
    ))
