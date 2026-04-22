#!/usr/bin/env python3
"""
Generate TTS audio and word-level subtitle chunks using edge-tts.
Usage: python generate_tts.py <input_json_path>
Input JSON: {"text": "...", "voice": "...", "audioPath": "...", "subtitlePath": "..."}
Output JSON to stdout: {"success": true, "totalMs": N, "wordCount": N} or {"error": "..."}
"""
import sys
import json
import asyncio


def split_sentence_words(text: str, start_ms: int, end_ms: int) -> list:
    """Fallback: split sentence into per-word chunks with proportional timing."""
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


async def generate(text: str, voice: str, audio_path: str, subtitle_path: str):
    try:
        import edge_tts
    except ImportError:
        print(json.dumps({"error": "edge-tts not installed. Run: pip install edge-tts"}))
        return

    communicate = edge_tts.Communicate(text, voice)
    words = []
    sentences = []

    with open(audio_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start_ms = chunk["offset"] // 10000
                dur_ms = chunk["duration"] // 10000
                # Skip punctuation-only tokens
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

    # Prefer WordBoundary (word-level); fall back to sentence splitting
    if words:
        subtitle_chunks = words
        total_ms = words[-1]["endMs"]
        word_count = len(words)
    elif sentences:
        subtitle_chunks = []
        for s in sentences:
            subtitle_chunks.extend(split_sentence_words(s["text"], s["startMs"], s["endMs"]))
        total_ms = sentences[-1]["endMs"] if sentences else 0
        word_count = len(subtitle_chunks)
    else:
        subtitle_chunks = []
        total_ms = 0
        word_count = 0

    with open(subtitle_path, "w", encoding="utf-8") as f:
        json.dump(subtitle_chunks, f, ensure_ascii=False, indent=2)

    print(json.dumps({"success": True, "totalMs": total_ms, "wordCount": word_count}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: generate_tts.py <input_json_path>"}))
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        params = json.load(f)

    asyncio.run(generate(
        params["text"],
        params["voice"],
        params["audioPath"],
        params["subtitlePath"],
    ))
