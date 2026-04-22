import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface SubtitleChunk {
  text: string;
  startMs: number;
  endMs: number;
}

const VOICES = {
  female: "es-AR-ElenaNeural",
  male: "es-AR-TomasNeural",
} as const;

const PYTHON_CMD = process.env.PYTHON_CMD ?? "python";

function findScriptPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "../../scripts/generate_tts.py"),
    path.resolve(process.cwd(), "scripts/generate_tts.py"),
    path.resolve(__dirname, "../../../../scripts/generate_tts.py"),
    path.resolve(__dirname, "../../../../../scripts/generate_tts.py"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly scriptPath = findScriptPath();

  async generate(
    text: string,
    gender: "female" | "male",
    outputDir: string,
    jobId: string,
  ): Promise<{ audioDataUrl: string; subtitleChunks: SubtitleChunk[]; totalMs: number } | null> {
    const voice = VOICES[gender];
    const audioPath = path.join(outputDir, `${jobId}_tts.mp3`);
    const subtitlePath = path.join(outputDir, `${jobId}_subs.json`);
    const inputPath = path.join(outputDir, `${jobId}_tts_input.json`);

    this.logger.log(`TTS start — voice=${voice}, script=${this.scriptPath}, exists=${fs.existsSync(this.scriptPath)}`);

    try {
      fs.writeFileSync(
        inputPath,
        JSON.stringify({ text, voice, audioPath, subtitlePath }),
        "utf-8",
      );

      const cmd = `"${PYTHON_CMD}" "${this.scriptPath}" "${inputPath}"`;
      this.logger.log(`TTS cmd: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 90_000,
        encoding: "utf8",
      });

      if (stderr && stderr.trim()) {
        this.logger.warn(`TTS stderr: ${stderr.slice(0, 500)}`);
      }

      this.logger.log(`TTS stdout: ${stdout.trim().slice(0, 200)}`);

      // Extract JSON from stdout (ignore any warnings before the JSON)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error(`TTS: no JSON in stdout: ${stdout.slice(0, 300)}`);
        return null;
      }

      const result = JSON.parse(jsonMatch[0]) as {
        success?: boolean;
        error?: string;
        totalMs?: number;
        wordCount?: number;
      };

      if (result.error) {
        this.logger.warn(`TTS skipped: ${result.error}`);
        return null;
      }

      if (!fs.existsSync(audioPath)) {
        this.logger.error(`TTS audio file not found at: ${audioPath}`);
        return null;
      }

      const subtitleChunks: SubtitleChunk[] = JSON.parse(
        fs.readFileSync(subtitlePath, "utf-8"),
      );

      // Convert MP3 to base64 data URL so Remotion's Chromium can access it inline
      const audioBuffer = fs.readFileSync(audioPath);
      const audioDataUrl = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;

      this.logger.log(
        `TTS OK — words=${result.wordCount}, ms=${result.totalMs}, audioSize=${audioBuffer.length}B, chunks=${subtitleChunks.length}`,
      );

      return { audioDataUrl, subtitleChunks, totalMs: result.totalMs ?? 0 };
    } catch (err) {
      this.logger.error(`TTS generation failed: ${String(err)}`);
      return null;
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }
  }

  async generateAmbientMusic(
    outputDir: string,
    jobId: string,
    durationSec: number,
  ): Promise<string | null> {
    const musicScriptCandidates = [
      path.resolve(process.cwd(), "../../scripts/generate_ambient_music.py"),
      path.resolve(process.cwd(), "scripts/generate_ambient_music.py"),
      path.resolve(__dirname, "../../../../scripts/generate_ambient_music.py"),
      path.resolve(__dirname, "../../../../../scripts/generate_ambient_music.py"),
    ];
    const musicScript = musicScriptCandidates.find((p) => fs.existsSync(p));

    if (!musicScript) {
      this.logger.warn("Ambient music script not found — skipping music");
      return null;
    }

    const outputWav = path.join(outputDir, `${jobId}_music.wav`);

    try {
      await execAsync(
        `"${PYTHON_CMD}" "${musicScript}" "${outputWav}" ${durationSec}`,
        { timeout: 30_000, encoding: "utf8" },
      );

      if (!fs.existsSync(outputWav)) return null;

      const wavBuffer = fs.readFileSync(outputWav);
      const dataUrl = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;
      this.logger.log(`Ambient music OK — ${wavBuffer.length}B WAV generated`);
      return dataUrl;
    } catch (err) {
      this.logger.warn(`Ambient music failed (continuing without it): ${String(err)}`);
      return null;
    } finally {
      if (fs.existsSync(outputWav)) fs.unlinkSync(outputWav);
    }
  }
}
