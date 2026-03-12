import { Injectable, Logger } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Shared AES-256-GCM encryption service for all sensitive tokens.
 * Used for: AI API keys, Meta OAuth tokens, MeLi tokens, Google Calendar tokens.
 *
 * Format: "enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 * Values not starting with "enc:" are treated as plaintext (legacy/dev mode).
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  private getKey(): Buffer | null {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) return null;
    return Buffer.from(hex, "hex");
  }

  /** Encrypt a plaintext string. Returns the original if ENCRYPTION_KEY is not set (dev mode). */
  encrypt(text: string): string {
    if (!text) return text;
    const key = this.getKey();
    if (!key) return text;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  /** Decrypt a value. Returns as-is if not encrypted (legacy/dev). */
  decrypt(text: string): string {
    if (!text || !text.startsWith("enc:")) return text;
    const key = this.getKey();
    if (!key) {
      this.logger.warn("ENCRYPTION_KEY not set but encrypted value found — cannot decrypt");
      return text;
    }
    const parts = text.split(":");
    if (parts.length !== 4) return text;
    try {
      const iv = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const encrypted = Buffer.from(parts[3], "hex");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted) + decipher.final("utf8");
    } catch (err) {
      this.logger.error(`Decryption failed: ${(err as Error).message}`);
      return text;
    }
  }
}
