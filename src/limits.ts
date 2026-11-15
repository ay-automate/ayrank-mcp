import { READ_LIMIT, WRITE_LIMIT } from "./config.js";

/** Sliding window shared by all read tools, matching the API's own limit. */
export class ReadLimiter {
  private stamps: number[] = [];
  constructor(private now: () => number) {}

  /** Returns 0 when the call may go ahead (and records it), else the seconds to wait. */
  take(): number {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < READ_LIMIT.windowMs);
    if (this.stamps.length >= READ_LIMIT.max) {
      return Math.max(1, Math.ceil((this.stamps[0] + READ_LIMIT.windowMs - t) / 1000));
    }
    this.stamps.push(t);
    return 0;
  }
}

/** One per write tool: a minimum gap between calls and a cap per process. */
export class WriteLimiter {
  private last = -Infinity;
  private count = 0;
  constructor(private now: () => number) {}

  /** Returns null when the write may go ahead (and records it), else the reason it may not. */
  take(): string | null {
    if (this.count >= WRITE_LIMIT.maxPerProcess) {
      return `This tool already ran ${WRITE_LIMIT.maxPerProcess} times in this server process. Restart the server to run it again.`;
    }
    const t = this.now();
    const wait = this.last + WRITE_LIMIT.minGapMs - t;
    if (wait > 0) {
      return `This tool runs at most once per 60 seconds. Try again in ${Math.ceil(wait / 1000)} s.`;
    }
    this.last = t;
    this.count += 1;
    return null;
  }
}
