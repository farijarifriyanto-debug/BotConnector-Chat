/**
 * Some models (seen: Gemini 2.5 Flash Lite, GPT-OSS) sometimes pad a markdown table with spaces and then never stop:
 * hundreds of KB of blanks until the token limit. Nothing visible arrives, the answer looks frozen at the table and the
 * stop button keeps spinning. This guard holds trailing blanks back, squeezes absurd runs of spaces, and tells the
 * caller to cut the stream once the model has produced nothing but blanks for a long stretch.
 */
export const PAD_KEEP = 80        // a run of spaces/tabs longer than this is squeezed to this (column alignment never needs more)
export const PAD_RUNAWAY = 1500   // this many blank characters in a row (spaces, tabs, newlines) = the model is stuck

export class PadGuard {
  private pending = ''
  /** `out` is what may be shown now; `stop` means the model is stuck in blanks and the stream should be cut. */
  feed(text: string): { out: string; stop: boolean } {
    const all = this.pending + text
    const tail = /\s*$/.exec(all)?.[0] ?? ''
    this.pending = tail
    const head = all.slice(0, all.length - tail.length)
    return { out: head.replace(/[ \t]{81,}/g, ' '.repeat(PAD_KEEP)), stop: tail.length > PAD_RUNAWAY }
  }
}
