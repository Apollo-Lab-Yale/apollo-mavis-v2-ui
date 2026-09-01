import { describe, expect, it } from "vitest";
import { buildFrame, parseFrameHeader } from "./binary";

describe("parseFrameHeader", () => {
  it("round-trips through buildFrame (little-endian)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const buf = buildFrame(1234.5678, jpeg);
    const h = parseFrameHeader(buf);
    expect(h.ts).toBeCloseTo(1234.5678, 9);
    expect(h.len).toBe(jpeg.byteLength);
    expect(h.payloadOffset).toBe(12);
    expect(new Uint8Array(buf, h.payloadOffset, h.len)).toEqual(jpeg);
  });

  it("reads the header as little-endian", () => {
    // Hand-build: ts = 1.0 (f64 LE), len = 258 (u32 LE: 02 01 00 00)
    const buf = new ArrayBuffer(12 + 258);
    const v = new DataView(buf);
    v.setFloat64(0, 1.0, true);
    v.setUint32(8, 258, true);
    const bytes = new Uint8Array(buf);
    expect(bytes[8]).toBe(0x02); // low byte first — LE on the wire
    expect(bytes[9]).toBe(0x01);
    expect(parseFrameHeader(buf).len).toBe(258);
  });

  it("throws on a truncated header", () => {
    expect(() => parseFrameHeader(new ArrayBuffer(11))).toThrow(/truncated/);
    expect(() => parseFrameHeader(new ArrayBuffer(0))).toThrow(/truncated/);
  });

  it("throws when the payload is shorter than declared", () => {
    const buf = buildFrame(1, new Uint8Array(10));
    const short = buf.slice(0, 12 + 5);
    expect(() => parseFrameHeader(short)).toThrow(/truncated/);
  });
});
