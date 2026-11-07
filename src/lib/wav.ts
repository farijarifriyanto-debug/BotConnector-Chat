/** A minimal RIFF/WAVE envelope for raw mono PCM16, so a BYOK transcription endpoint can read what the microphone heard. */
export function wrapPcmAsWav(chunks: Uint8Array[], sampleRate: number): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(44 + total)
  const dv = new DataView(out.buffer)
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i) }
  const u32 = (off: number, v: number) => dv.setUint32(off, v, true)
  const u16 = (off: number, v: number) => dv.setUint16(off, v, true)
  w(0, 'RIFF'); u32(4, 36 + total); w(8, 'WAVE'); w(12, 'fmt ')
  u32(16, 16); u16(20, 1); u16(22, 1); u32(24, Math.round(sampleRate || 16000)); u32(28, Math.round(sampleRate || 16000) * 2); u16(32, 2); u16(34, 16)
  w(36, 'data'); u32(40, total)
  let off = 44
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
