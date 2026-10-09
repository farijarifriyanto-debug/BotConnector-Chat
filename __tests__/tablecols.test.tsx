import './helpers/mocks'
import { render } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import { columnWidths, COL_MAX, COL_MIN } from '../src/lib/tablecols'
import { Markdown } from '../src/components/Markdown'

jest.setTimeout(60000)   // the first render in a file loads the whole component tree

describe('columnWidths', () => {
  it('gives every column one width from its widest cell, within the limits', () => {
    const w = columnWidths(['Fitur', 'BotConnector', 'Catatan'], [['Model Lokal', 'Mendukung model open-weight secara lokal di perangkat dengan penjelasan yang sangat panjang sekali', 'ok'], ['API', 'OpenAI-compatible', 'x']])
    expect(w).toHaveLength(3)
    expect(w[1]).toBe(COL_MAX)                       // long text wraps inside the maximum
    expect(w[2]).toBe(COL_MIN)                       // short text never shrinks below the minimum
    expect(w[0]).toBeGreaterThan(COL_MIN); expect(w[0]).toBeLessThan(COL_MAX)
  })
  it('never cuts a long word in half when it fits', () => {
    expect(columnWidths(['Kolom'], [['Internationalization']])[0]).toBeGreaterThanOrEqual(20 * 8.4)
  })
  it('handles ragged and empty tables', () => {
    expect(columnWidths([], [])).toEqual([])
    expect(columnWidths(['a', 'b'], [['x']])).toHaveLength(2)
  })
})

describe('table rendering', () => {
  it('uses the same width for all cells of a column', async () => {
    const text = '| Fitur | Isi |\n|---|---|\n| Model Lokal | Mendukung BotConnector Local untuk menjalankan model open-weight |\n| API | ok |\n'
    const r = await render(<Markdown text={text} />)
    const widths: number[] = []
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(walk)
      const node = n as { props?: { style?: unknown }; children?: unknown }
      const w = (StyleSheet.flatten(node.props?.style as never) as { width?: unknown } | undefined)?.width
      if (typeof w === 'number') widths.push(w)
      walk(node.children)
    }
    walk(r.toJSON())
    expect(widths).toHaveLength(6)                   // 3 rows x 2 cells
    expect(new Set([widths[0], widths[2], widths[4]]).size).toBe(1)
    expect(new Set([widths[1], widths[3], widths[5]]).size).toBe(1)
    expect(widths[1]).toBeGreaterThan(widths[0])
  })
})
