/** Clock-skew estimator for video latency badges (05-ui §5.4).
 *
 * offset = min over a sliding window of (clientNow - serverTs); latency shown
 * is (clientNow - serverTs - offset) — relative latency growth, robust to
 * clock skew between server monotonic time and the client wall clock.
 */

export class SkewEstimator {
  private samples: { at: number; offset: number }[] = [];

  constructor(private windowMs = 5000) {}

  /** Record one frame arrival; returns estimated latency in ms (never negative). */
  observe(serverTsSeconds: number, clientNowMs: number): number {
    const offset = clientNowMs - serverTsSeconds * 1000;
    this.samples.push({ at: clientNowMs, offset });
    const cutoff = clientNowMs - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.at < cutoff) this.samples.shift();
    let min = Infinity;
    for (const s of this.samples) if (s.offset < min) min = s.offset;
    return Math.max(0, offset - min);
  }
}
