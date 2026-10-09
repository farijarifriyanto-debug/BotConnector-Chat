import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Linking } from 'react-native'
import { Markdown } from '../src/components/Markdown'

const sources = [{ title: 'BPBD', url: 'https://bpbd.example/a' }, { title: 'Evil', url: 'javascript:alert(1)' }]

describe('Markdown', () => {
  it('renders headings, emphasis, lists and code', async () => {
    const r = await render(<Markdown text={'# Judul\n\nIni **tebal** dan *miring* dengan `kode`.\n\n- satu\n- dua\n\n1. a\n2. b\n\n```js\nconst x = 1\n```'} />)
    expect(r.getByText('Judul')).toBeTruthy(); expect(r.getByText('tebal')).toBeTruthy(); expect(r.getByText('satu')).toBeTruthy()
    expect(r.getByText('const x = 1')).toBeTruthy(); expect(r.getByText('js')).toBeTruthy()
  })

  it('turns [n] into a tappable pill that opens source n, and leaves unsafe or unknown numbers as text', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const r = await render(<Markdown text="Jakarta cerah [1]. Palsu [2]. Tidak ada [9]." sources={sources} />)
    await fireEvent.press(r.getByRole('link', { name: 'BPBD' }))
    expect(open).toHaveBeenCalledWith('https://bpbd.example/a')
    expect(r.queryByRole('link', { name: 'Evil' })).toBeNull()   // a javascript: source is never linked
    open.mockRestore()
  })

  it('never opens an unsafe markdown link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const r = await render(<Markdown text="[klik](javascript:alert(1)) dan [aman](https://example.com)" />)
    await fireEvent.press(r.getByText('klik')); expect(open).not.toHaveBeenCalled()
    await fireEvent.press(r.getByText('aman')); expect(open).toHaveBeenCalledWith('https://example.com')
    open.mockRestore()
  })

  it('shows raw HTML as text, not as markup', async () => {
    const r = await render(<Markdown text={'<img src=x onerror=alert(1)>'} />)
    expect(r.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  })

  it('offers a chart for a numeric table and none for a text table; the chart switches views', async () => {
    const r = await render(<Markdown text={'| Buah | Stok | Harga |\n|---|---|---|\n| Apel | 50 | 15.000 |\n| Jeruk | 30 | 12.000 |'} />)
    expect(r.getByText('Apel')).toBeTruthy()
    await fireEvent.press(r.getByTestId('table-chart-open'))
    expect(r.getByTestId('chart-svg')).toBeTruthy()
    await fireEvent.press(r.getByTestId('chart-type-line')); await fireEvent.press(r.getByTestId('chart-type-pie')); await fireEvent.press(r.getByTestId('chart-series-0'))
    const r2 = await render(<Markdown text={'| a | b |\n|---|---|\n| x | y |\n| z | w |'} />)
    expect(r2.queryByTestId('table-chart-open')).toBeNull()   // a text table has no chart button
  })
})

describe('HTML code blocks', () => {
  it('offers a preview only for html, not for other languages', async () => {
    const a = await render(<Markdown text={'```html\n<h1>Halo</h1>\n```'} />)
    expect(a.getByTestId('html-preview')).toBeTruthy()
    const b = await render(<Markdown text={'```js\nconst a = 1\n```'} />)
    expect(b.queryByTestId('html-preview')).toBeNull()
  })

  it('shows a half-written table as plain text while streaming and as a table once the answer is complete', async () => {
    const table = 'Ringkasan.\n\n| Fitur | Harga |\n|---|---|\n| A | 10 |\n| B | 20 |\n'
    const live = await render(<Markdown text={table} streaming />)
    expect(live.queryByTestId('table-chart-open')).toBeNull()
    expect(live.getByText(/\| Fitur \| Harga \|/)).toBeTruthy()
    const half = await render(<Markdown text={'Ringkasan.\n\n| Fitur | BotConnector.id | Spicelab'} streaming />)
    expect(half.getByText(/\| Fitur \| BotConnector\.id \| Spicelab/)).toBeTruthy()
    const done = await render(<Markdown text={table} />)
    expect(done.queryByText(/\| Fitur \| Harga \|/)).toBeNull()      // rendered as cells now
    expect(done.getByText('Fitur')).toBeTruthy()
  })
})
