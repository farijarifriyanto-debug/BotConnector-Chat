import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { ToolDescriptionsSheet } from '../src/components/ToolDescriptionsSheet'
import { TOOLS } from '../src/lib/agent'
import { useSettings } from '../src/store/settings'
import { useToolSchema } from '../src/store/toolSchema'

jest.setTimeout(30000)
const shipped = TOOLS[0].function.description

beforeEach(() => {
  useToolSchema.setState({ tools: {} })
  useSettings.setState({ lang: 'en' })
})

describe('Tool Descriptions sheet', () => {
  it('shows both shipped tools with their built-in wording', async () => {
    const r = await render(<ToolDescriptionsSheet visible onClose={() => {}} />)
    expect(r.getByText('Tool Descriptions')).toBeTruthy()
    expect(r.getByTestId('tool-web_search')).toBeTruthy()
    expect(r.getByTestId('tool-read_url')).toBeTruthy()
    expect(r.getByTestId('tool-desc-web_search').props.value).toBe(shipped)
    expect(r.getByTestId('tool-param-web_search-query').props.value).toBe('Search query')
    expect(r.queryByTestId('tool-modified-web_search')).toBeNull()
  })

  it('lists the Memory and Device tools under their own groups', async () => {
    const r = await render(<ToolDescriptionsSheet visible onClose={() => {}} />)
    expect(r.getByText('Search')).toBeTruthy()
    expect(r.getByText('Memory')).toBeTruthy()
    expect(r.getByText('Device tools')).toBeTruthy()
    for (const name of ['memory_read', 'memory_update', 'memory_edit', 'memory_delete', 'get_time_info', 'clipboard_tool', 'calculate']) {
      expect(r.getByTestId(`tool-${name}`)).toBeTruthy()
    }
    expect(r.getByTestId('tool-param-calculate-expression')).toBeTruthy()
  })

  it('marks a changed tool and keeps the wording after typing settles', async () => {
    const r = await render(<ToolDescriptionsSheet visible onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('tool-desc-web_search'), 'Cari di internet untuk berita terbaru.')
    expect(r.getByTestId('tool-modified-web_search')).toBeTruthy()
    await waitFor(() => expect(useToolSchema.getState().tools.web_search?.description).toBe('Cari di internet untuk berita terbaru.'))
    await fireEvent.changeText(r.getByTestId('tool-param-web_search-query'), 'Kata pencarian')
    await waitFor(() => expect(useToolSchema.getState().tools.web_search?.params?.query).toBe('Kata pencarian'))
  })

  it('restores the built-in wording for one tool', async () => {
    useToolSchema.setState({ tools: { web_search: { description: 'Cari.' } } })
    const r = await render(<ToolDescriptionsSheet visible onClose={() => {}} />)
    expect(r.getByTestId('tool-modified-web_search')).toBeTruthy()
    await fireEvent.press(r.getByTestId('tool-reset-web_search'))
    expect(r.queryByTestId('tool-modified-web_search')).toBeNull()
    expect(r.getByTestId('tool-desc-web_search').props.value).toBe(shipped)
    await waitFor(() => expect(useToolSchema.getState().tools.web_search).toBeUndefined())
  })

  it('typing the shipped text back clears the "Modified" mark', async () => {
    const r = await render(<ToolDescriptionsSheet visible onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('tool-desc-web_search'), 'Lain.')
    expect(r.getByTestId('tool-modified-web_search')).toBeTruthy()
    await fireEvent.changeText(r.getByTestId('tool-desc-web_search'), shipped)
    expect(r.queryByTestId('tool-modified-web_search')).toBeNull()
  })
})
