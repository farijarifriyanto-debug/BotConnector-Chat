import './helpers/mocks'
import { resolveCitations } from '../src/lib/cite'
import { plainText } from '../src/lib/speech'
import type { Source } from '../src/lib/types'

const sources: Source[] = [
  { title: 'A', url: 'https://a.example', id: 'ra1b2c3' },
  { title: 'B', url: 'https://b.example', id: 'rd4e5f6' },
]

describe('inline citations [cite:id]', () => {
  it('turns a marker into the number of that source, in source order', () => {
    expect(resolveCitations('Harga naik. [cite:rd4e5f6]', sources)).toBe('Harga naik. [2]')
    expect(resolveCitations('Harga naik. [cite:ra1b2c3]', sources)).toBe('Harga naik. [1]')
  })

  it('keeps chained markers and drops unknown or invented ids', () => {
    expect(resolveCitations('Terkonfirmasi. [cite:ra1b2c3][cite:rd4e5f6]', sources)).toBe('Terkonfirmasi. [1][2]')
    expect(resolveCitations('Terkonfirmasi. [cite:zzzzzz]', sources)).toBe('Terkonfirmasi. ')
  })

  it('leaves text without markers, and markers inside code, alone', () => {
    expect(resolveCitations('Biasa saja.', sources)).toBe('Biasa saja.')
    expect(resolveCitations('Pakai `[cite:ra1b2c3]` di kode.', sources)).toBe('Pakai `[cite:ra1b2c3]` di kode.')
  })

  it('is spoken plainly: no cite markers and no numbers', () => {
    expect(plainText('Harga naik. [cite:ra1b2c3]')).toBe('Harga naik.')
    expect(plainText('Harga naik. [1][2]')).toBe('Harga naik.')
  })
})
