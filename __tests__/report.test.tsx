import './helpers/mocks'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Linking } from 'react-native'
import { ReportSheet } from '../src/components/ReportSheet'
import { ReportError, reportMailto, reportSubject, reportText, sendReport, type Report } from '../src/lib/report'
import { useAuth } from '../src/store/auth'
import type { Msg } from '../src/lib/types'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const base: Report = { reason: 'wrong', note: 'salah fakta', reply: 'Jakarta ibu kota Jepang.', prompt: 'Apa ibu kota Indonesia?', model: 'Gemini 2.5', hasImage: false, app: 'ios' }
const msg: Msg = { id: 'a', role: 'assistant', content: 'Jakarta ibu kota Jepang.', createdAt: 1, model: 'Gemini 2.5' }

describe('report a reply', () => {
  beforeEach(() => { mockFetch.mockReset(); useAuth.setState({ account: null } as never) })
  it('writes a readable report and a one-line subject, and caps very long text', () => {
    const t = reportText({ ...base, reply: 'x'.repeat(9000), prompt: 'q'.repeat(5000) })
    expect(t).toContain('Reason: False or misleading'); expect(t).toContain('Model: Gemini 2.5'); expect(t).toContain('--- Reply ---')
    expect(t.length).toBeLessThan(9000); expect(reportSubject(base)).not.toMatch(/[\r\n]/)
    expect(decodeURIComponent(reportMailto({ ...base, reply: 'y'.repeat(9000) }))).toContain('mailto:admin@botconnector.id?subject=[Content report]')
    expect(reportMailto({ ...base, reply: 'y'.repeat(9000) }).length).toBeLessThan(9500)
    expect(reportText({ ...base, reply: '', hasImage: true })).toContain('the picture itself is not sent')
  })
  it('sends it as a support ticket and returns the reference; failures are named', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { success: true, reference: 'SUP-123' }))
    expect(await sendReport({ name: 'Budi', email: 'b@x.id' }, base)).toBe('SUP-123')
    const [url, init] = mockFetch.mock.calls[0]; expect(url).toBe('https://botconnector.id/support'); expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toMatchObject({ requester_name: 'Budi', requester_email: 'b@x.id', category: 'OTHER' })
    for (const [status, why] of [[429, 'rate'], [400, 'invalid'], [503, 'down']] as const) { mockFetch.mockResolvedValueOnce(reply(status, {})); await expect(sendReport({ name: 'a', email: 'a@b.id' }, base)).rejects.toMatchObject({ reason: why }) }
    mockFetch.mockRejectedValueOnce(new Error('offline')); await expect(sendReport({ name: 'a', email: 'a@b.id' }, base)).rejects.toBeInstanceOf(ReportError)
  })
  it('signed in: a reason is needed, then the report goes out and the person sees the reference', async () => {
    useAuth.setState({ account: { email: 'b@x.id', display_name: 'Budi' } } as never)
    mockFetch.mockResolvedValue(reply(200, { success: true, reference: 'SUP-9' }))
    const onClose = jest.fn(), r = await render(<ReportSheet msg={msg} prompt="Apa ibu kota Indonesia?" onClose={onClose} />)
    expect(r.getByTestId('report-send').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(r.getByTestId('reason-wrong')); await fireEvent.changeText(r.getByTestId('report-note'), 'tidak benar')
    await fireEvent(r.getByTestId('report-prompt'), 'valueChange', false)               // leave the question out
    await fireEvent.press(r.getByTestId('report-send'))
    await waitFor(() => expect(r.getByTestId('report-done')).toBeTruthy()); expect(r.getByText('Reference: SUP-9')).toBeTruthy()
    const body = JSON.parse(mockFetch.mock.calls[0][1].body); expect(body.message).toContain('Jakarta ibu kota Jepang'); expect(body.message).not.toContain('Apa ibu kota'); expect(body.message).toContain('tidak benar')
    await fireEvent.press(r.getByTestId('report-ok')); expect(onClose).toHaveBeenCalled()
  })
  it('a failed send keeps the report and offers email; without an account email is the way', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    useAuth.setState({ account: { email: 'b@x.id' } } as never); mockFetch.mockResolvedValue(reply(503, {}))
    const a = await render(<ReportSheet msg={msg} prompt="" onClose={() => {}} />)
    await fireEvent.press(a.getByTestId('reason-harmful')); await fireEvent.press(a.getByTestId('report-send'))
    await waitFor(() => expect(a.getByTestId('report-error')).toBeTruthy()); await fireEvent.press(a.getByTestId('report-mail'))
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining('mailto:admin@botconnector.id'))
    await act(async () => { useAuth.setState({ account: null } as never) })
    const g = await render(<ReportSheet msg={msg} prompt="" onClose={() => {}} />)
    expect(g.queryByTestId('report-send')).toBeNull(); await fireEvent.press(g.getByTestId('reason-other')); await fireEvent.press(g.getByTestId('report-mail'))
    expect(open).toHaveBeenCalledTimes(2); open.mockRestore()
  })
})
