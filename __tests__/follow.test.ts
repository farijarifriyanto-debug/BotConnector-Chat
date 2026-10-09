import { Follow, throttled } from '../src/lib/follow'

const m = (contentHeight: number, offset: number) => ({ contentHeight, viewHeight: 600, offset })
describe('following the answer', () => {
  it('growth alone never stops it, however big the chunk (a table or a code block)', () => {
    const f = new Follow(), t = 1000
    expect(f.scroll(m(2000, 1400), t)).toBe(false)      // at the end
    expect(f.scroll(m(2900, 1400), t)).toBe(false)      // 900 px arrived before the list scrolled: not the reader's doing
    expect(f.stick).toBe(true)
  })
  it('a finger moving the list up stops it and shows the button; coming back to the end resumes', () => {
    const f = new Follow(); f.begin()
    expect(f.scroll(m(2000, 700), 1000)).toBe(true); expect(f.stick).toBe(false)
    expect(f.scroll(m(2200, 1550), 1100)).toBe(false); expect(f.stick).toBe(true)   // dragged back to the bottom
  })
  it('a fling after lifting the finger still counts for a moment, then the list is on its own again', () => {
    const f = new Follow(); f.begin(); f.end(2.5, 1000)
    expect(f.scroll(m(2000, 300), 1500)).toBe(true)     // still flying upwards
    f.momentumEnd(); expect(f.scroll(m(2400, 300), 2000)).toBe(true)   // stays where the reader left it: growth does not pull it back by itself
    expect(f.stick).toBe(false)
  })
  it('a stopped finger (no speed) ends the touch at once; "down" and sending resume following', () => {
    const f = new Follow(); f.begin(); f.end(0, 1000)
    f.scroll(m(2000, 1400), 1001); expect(f.stick).toBe(true)
    f.begin(); f.scroll(m(2000, 100), 1002); expect(f.stick).toBe(false); f.jump(); expect(f.stick).toBe(true)
  })
})

describe('throttled', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  it('turns a storm of calls into one call per interval and never drops the last one', () => {
    let t = 0; const fn = jest.fn(); const th = throttled(fn, 100, () => t)
    for (let i = 0; i < 500; i++) th()                      // 500 size events in the same instant
    expect(fn).toHaveBeenCalledTimes(1)
    t = 40; jest.advanceTimersByTime(40); expect(fn).toHaveBeenCalledTimes(1)
    t = 100; jest.advanceTimersByTime(60); expect(fn).toHaveBeenCalledTimes(2)   // the trailing call
    t = 150; th(); expect(fn).toHaveBeenCalledTimes(2)       // too soon: waits
    t = 200; jest.advanceTimersByTime(50); expect(fn).toHaveBeenCalledTimes(3)
    th.cancel(); t = 400; th(); expect(fn).toHaveBeenCalledTimes(4)
  })
  it('cancel drops a pending call', () => {
    let t = 0; const fn = jest.fn(); const th = throttled(fn, 100, () => t)
    th(); t = 10; th(); th.cancel(); t = 500; jest.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
