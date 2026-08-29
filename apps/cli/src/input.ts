import type { Interface } from 'node:readline/promises';

/**
 * A line queue over readline.
 *
 * `rl.question()` only listens for a line at the moment it is called, so any
 * lines that arrive earlier are dropped. That is invisible when a person types
 * one line at a time, but it silently swallows piped input — which makes the
 * client impossible to script or demo. Buffering every line as it arrives fixes
 * both cases with the same code.
 */
export class LineReader {
  private queued: string[] = [];
  private waiting: ((line: string | null) => void)[] = [];
  private closed = false;

  constructor(rl: Interface) {
    rl.on('line', (line: string) => {
      const next = this.waiting.shift();
      if (next) next(line);
      else this.queued.push(line);
    });
    rl.on('close', () => {
      this.closed = true;
      while (this.waiting.length > 0) this.waiting.shift()!(null);
    });
  }

  /** The next line, or null once input is exhausted. */
  next(): Promise<string | null> {
    const buffered = this.queued.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiting.push(resolve));
  }
}
