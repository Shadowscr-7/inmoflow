#!/usr/bin/env python3
"""
Generate TTS audio and subtitle chunks using edge-tts.
Usage: python generate_tts.py <input_json_path>
Input JSON: {"text": "...", "voice": "...", "audioPath": "...", "subtitlePath": "..."}
Output JSON to stdout: {"success": true, "totalMs": N, "wordCount": N} or {"error": "..."}

Install: pip install edge-tts
"""
import sys
import json
import asyncio


MAX_WORDS_PER_CHUNK = 5


def split_sentence_into_chunks(text: str, start_ms: int, end_ms: int) -> list:
    """Split a sentence into subtitle chunks with proportional timing."""
    words = text.split()
    total_words = len(words)
    total_dur = end_ms - start_ms

    if total_words == 0:
        return []

    if total_words <= MAX_WORDS_PER_CHUNK:
        return [{"text": text, "startMs": start_ms, "endMs": end_ms}]

    ms_per_word = total_dur / total_words
    chunks = []
    for i in range(0, total_words, MAX_WORDS_PER_CHUNK):
        group = words[i : i + MAX_WORDS_PER_CHUNK]
        group_start = start_ms + int(i * ms_per_word)
        group_end = start_ms + int((i + len(group)) * ms_per_word)
        chunks.append({
            "text": " ".join(group),
            "startMs": group_start,
            "endMs": group_end,
        })
    return chunks


async def generate(text: str, voice: str, audio_path: str, subtitle_path: str):
    try:
        import edge_tts
    except ImportError:
        print(json.dumps({"error": "edge-tts not installed. Run: pip install edge-tts"}))
        return

    communicate = edge_tts.Communicate(text, voice)
    sentences = []

    with open(audio_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                start_ms = chunk["offset"] // 10000
                dur_ms = chunk["duration"] // 10000
                sentences.append({
                    "text": chunk["text"],
                    "startMs": start_ms,
                    "endMs": start_ms + dur_ms,
                })

    # Build subtitle chunks from sentence boundaries
    all_chunks = []
    for sent in sentences:
        all_chunks.extend(
            split_sentence_into_chunks(sent["text"], sent["startMs"], sent["endMs"])
        )

    with open(subtitle_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    total_ms = sentences[-1]["endMs"] if sentences else 0
    word_count = sum(len(s["text"].split()) for s in sentences)

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
