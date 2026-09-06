/** Worker entry: WS + OffscreenCanvas render loop (05-ui §5.5, default off).
 *
 * Same parse/decode/draw loop as the main-thread path, entirely off the main
 * thread. Shares binary.ts + reconnecting.ts (both DOM-free).
 */
import { parseFrameHeader } from "../../lib/binary";
import { SkewEstimator } from "../../lib/time";
import { ReconnectingWS } from "./reconnecting";

let ws: ReconnectingWS | null = null;
let canvas: OffscreenCanvas | null = null;
let decoding = false;
let sized = false;
const skew = new SkewEstimator();

async function onFrame(buf: ArrayBuffer): Promise<void> {
  if (decoding || !canvas) return;
  let header;
  try {
    header = parseFrameHeader(buf);
  } catch {
    return;
  }
  decoding = true;
  try {
    const blob = new Blob([new Uint8Array(buf, header.payloadOffset, header.len)], {
      type: "image/jpeg",
    });
    const bmp = await createImageBitmap(blob);
    if (!sized) {
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      sized = true;
    }
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
    ctx?.drawImage(bmp, 0, 0);
    bmp.close();
    const now = performance.now();
    postMessage({ t: "frame", drawAt: now, latencyMs: skew.observe(header.ts, now) });
  } catch {
    /* drop */
  } finally {
    decoding = false;
  }
}

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data as { t: string; url?: string; canvas?: OffscreenCanvas };
  if (m.t === "start" && m.url && m.canvas) {
    canvas = m.canvas;
    ws = new ReconnectingWS({
      url: m.url,
      binaryType: "arraybuffer",
      onMessage: (data) => {
        if (typeof data !== "string") void onFrame(data);
      },
      onStatus: (status) => postMessage({ t: "status", status }),
    });
  } else if (m.t === "reconnect") {
    ws?.reconnectNow(); // main thread saw a half-open socket (video.ts healIfHalfOpen)
  } else if (m.t === "stop") {
    ws?.close();
    ws = null;
  }
};
