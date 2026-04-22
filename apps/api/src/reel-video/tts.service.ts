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

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly scriptPath = path.resolve(process.cwd(), "../../scripts/generate_tts.py");

  async generate(
    text: string,
    gender: "female" | "male",
    outputDir: string,
    jobId: string,
  ): Promise<{ audioPath: string; subtitleChunks: SubtitleChunk[]; totalMs: number } | null> {
    const voice = VOICES[gender];
    const audioPath = path.join(outputDir, `${jobId}_tts.mp3`);
    const subtitlePath = path.join(outputDir, `${jobId}_subs.json`);
    const inputPath = path.join(outputDir, `${jobId}_tts_input.json`);

    try {
      fs.writeFileSync(
        inputPath,
        JSON.stringify({ text, voice, audioPath, subtitlePath }),
        "utf-8",
      );

      const { stdout } = await execAsync(`python "${this.scriptPath}" "${inputPath}"`, {
        timeout: 90_000,
      });

      const result = JSON.parse(stdout.trim()) as {
        success?: boolean;
        error?: string;
        totalMs?: number;
        wordCount?: number;
      };

      if (result.error) {
        this.logger.warn(`TTS skipped: ${result.error}`);
        return null;
      }

      const subtitleChunks: SubtitleChunk[] = JSON.parse(
        fs.readFileSync(subtitlePath, "utf-8"),
      );

      this.logger.log(`TTS OK: voice=${voice}, words=${result.wordCount}, ms=${result.totalMs}`);
      return { audioPath, subtitleChunks, totalMs: result.totalMs ?? 0 };
    } catch (err) {
      this.logger.warn(`TTS generation failed (rendering without audio): ${String(err)}`);
      return null;
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }
  }
}
