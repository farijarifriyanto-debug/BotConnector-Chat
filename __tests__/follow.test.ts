import { Follow } from '../src/lib/follow'

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
