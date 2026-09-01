/** Video frame header parse — pure, DOM-free (shared with the worker path).
 *
 * Wire layout (matches the server's `struct.pack("<dI", ts, len) + jpeg`):
 * little-endian, 12-byte header — f64 ts_seconds @0, u32 jpeg_len @8,
 * JPEG bytes from offset 12.
 */

export const HEADER_SIZE = 12;

export interface VideoFrameHeader {
  ts: number;
  len: number;
  payloadOffset: 12;
}

export function parseFrameHeader(buf: ArrayBuffer): VideoFrameHeader {
  if (buf.byteLength < HEADER_SIZE) {
    throw new Error(`video frame truncated: ${buf.byteLength} < ${HEADER_SIZE} header bytes`);
  }
  const view = new DataView(buf);
  const ts = view.getFloat64(0, true);
  const len = view.getUint32(8, true);
  if (buf.byteLength < HEADER_SIZE + len) {
    throw new Error(
      `video frame truncated: payload ${buf.byteLength - HEADER_SIZE} < declared ${len}`,
    );
  }
  return { ts, len, payloadOffset: HEADER_SIZE };
}

/** Test/mock helper mirroring the server encoding. */
export function buildFrame(ts: number, jpeg: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_SIZE + jpeg.byteLength);
  const view = new DataView(buf);
  view.setFloat64(0, ts, true);
  view.setUint32(8, jpeg.byteLength, true);
  new Uint8Array(buf, HEADER_SIZE).set(jpeg);
  return buf;
}
