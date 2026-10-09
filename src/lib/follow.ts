export interface Metrics { contentHeight: number; viewHeight: number; offset: number }
const NEAR = 120, MOMENTUM_MS = 900

/**
 * Follow-the-answer for the chat list. Only the reader's own finger may stop it: when text is added the list grows before
 * it has scrolled, which looks exactly like "scrolled away", so a position alone can never be trusted.
 */
export class Follow {
  /** keep the end of the answer in view */
  stick = true
  private until = 0
  /** a finger went down on the list */
  begin() { this.until = Infinity }
  /** the finger lifted: a fling may carry on for a moment (velocity 0 means it stopped; unknown means maybe) */
  end(velocityY?: number, now = Date.now()) { this.until = velocityY === 0 ? 0 : now + MOMENTUM_MS }
  momentumEnd() { this.until = 0 }
  /** the list scrolled; returns true if the reader has moved away from the end (the button then shows) */
  scroll(m: Metrics, now = Date.now()): boolean {
    const away = m.contentHeight - m.viewHeight - m.offset > NEAR
    if (now < this.until) this.stick = !away
    return !this.stick
  }
  /** the reader pressed "down", or sent a message */
  jump() { this.stick = true; this.until = 0 }
}

/** At most one call per `ms`, the last one always delivered: content-size events can fire in a storm while a table is laid out, and each one used to scroll the list. */
export function throttled(fn: () => void, ms: number, now: () => number = Date.now) {
  let last = -Infinity, timer: ReturnType<typeof setTimeout> | null = null
  const run = () => { timer = null; last = now(); fn() }
  const call = () => {
    const wait = ms - (now() - last)
    if (wait <= 0) { if (timer) clearTimeout(timer); run() } else if (!timer) timer = setTimeout(run, wait)
  }
  call.cancel = () => { if (timer) clearTimeout(timer); timer = null }
  return call
}
