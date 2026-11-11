// Tiny JSON file store for bot data (settings, warnings, XP, ...). Files live in DATA_DIR,
// which on Railway is the volume at /app/data, so data survives redeploys.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const dataDir = resolve(process.env.DATA_DIR?.trim() || "data");
mkdirSync(dataDir, { recursive: true });

export class JsonStore<T> {
  private file: string;
  data: T;
  private writing: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(name: string, initial: T) {
    this.file = join(dataDir, `${name}.json`);
    this.data = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as T) : initial;
  }

  /** Saves now (writes are queued so they never overlap). */
  save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.file);
    }).catch((e) => console.error(`Saving ${this.file} failed:`, e));
    return this.writing;
  }

  /** Saves within a few seconds, batching frequent changes (like XP on every message). */
  saveSoon(delayMs = 5000) {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.save(); }, delayMs);
  }
}
