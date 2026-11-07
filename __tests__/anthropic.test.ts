import './helpers/mocks'
import { listAnthropicModels, parseAnthropicEvent, toAnthropicBody, ANTHROPIC_VERSION } from '../src/api/anthropic'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 400, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body })

type B = { model: string; system?: string; messages: { role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }[]; tools?: unknown[]; max_tokens?: number; thinking?: { type: string; budget_tokens: number }; temperature?: number; botconnector_file_ids?: unknown }
const tr = (x: Record<string, unknown>): B => toAnthropicBody(x) as B

describe('OpenAI request -> Anthropic Messages request', () => {
  it('merges system notes into the system parameter and strips them from messages', () => {
    const b = tr({ model: 'custom:p1:claude-x', messages: [
      { role: 'system', content: 'first' },
      { role: 'system', content: 'second' },
      { role: 'user', content: 'hi' },
    ] })
    expect(b.system).toBe('first\n\nsecond')
    expect(b.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(b.model).toBe('claude-x')   // the raw upstream id, not our custom: prefix
    expect(b.botconnector_file_ids).toBeUndefined()   // cloud-only field must not reach Anthropic
  })
  it('turns inline images into base64 source blocks', () => {
    const b = tr({ model: 'm', messages: [
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }] },
    ] })
    expect(b.messages[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
    ])
  })
  it('translates assistant tool calls into tool_use blocks and tool answers into tool_result blocks', () => {
    const b = tr({ model: 'm', messages: [
      { role: 'user', content: 'what time is it' },
      { role: 'assistant', content: 'checking', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_time_info', arguments: '{"tz":"Asia/Jakarta"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"hour":9}' },
      { role: 'tool', tool_call_id: 'c2', content: '{"note":"stale"}' },
    ] })
    expect(b.messages[1].content).toEqual([{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 'c1', name: 'get_time_info', input: { tz: 'Asia/Jakarta' } }])
    expect(b.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"hour":9}' }, { type: 'tool_result', tool_use_id: 'c2', content: '{"note":"stale"}' }] })
  })
  it('sends an assistant message with only tool calls as a tool_use content list', () => {
    const b = tr({ model: 'm', messages: [
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
    ] })
    expect(b.messages[0].content).toEqual([{ type: 'tool_use', id: 'c1', name: 't', input: {} }])
  })
  it('maps tool definitions to Anthropic tool schemas', () => {
    const b = tr({ model: 'm', messages: [], tools: [{ type: 'function', function: { name: 'f', description: 'does f', parameters: { type: 'object', properties: { a: { type: 'string' } } } } }] })
    expect(b.tools).toEqual([{ name: 'f', description: 'does f', input_schema: { type: 'object', properties: { a: { type: 'string' } } } }])
  })
  it('always sends max_tokens: a default of 4096 unless the caller set one', () => {
    expect(tr({ model: 'm', messages: [] }).max_tokens).toBe(4096)
    expect(tr({ model: 'm', messages: [], max_tokens: 32 }).max_tokens).toBe(32)
  })
  it('reasoning_effort "none" means no thinking; a real effort enables thinking and drops the temperature', () => {
    const off = tr({ model: 'm', messages: [], reasoning_effort: 'none', temperature: 0.3 })
    expect(off.thinking).toBeUndefined()
    expect(off.temperature).toBe(0.3)
    const on = tr({ model: 'm', messages: [], reasoning_effort: 'high', temperature: 0.3 })
    expect(on.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 })
    expect(on.max_tokens).toBeGreaterThanOrEqual(4096 + 1024)   // Anthropic requires max_tokens above the thinking budget
    expect(on.temperature).toBeUndefined()
  })
})

describe('Anthropic SSE event -> Delta', () => {
  it('reads text, thinking, tool use and usage', () => {
    expect(parseAnthropicEvent('{"type":"message_start","message":{"usage":{"input_tokens":12}}}')).toEqual({ usage: { input: 12, output: 0, total: 12 } })
    expect(parseAnthropicEvent('{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}')).toEqual({ content: 'Hi' })
    expect(parseAnthropicEvent('{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}')).toEqual({ reasoning: 'hmm' })
    expect(parseAnthropicEvent('{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"get_time_info"}}'))
      .toEqual({ toolCalls: [{ index: 1, id: 't1', name: 'get_time_info' }] })
    const args = parseAnthropicEvent('{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"tz\\":"}}')
    expect(args?.toolCalls).toEqual([{ index: 1, args: '{"tz":' }])
    const end = parseAnthropicEvent('{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}')
    expect(end?.finish).toBe('tool_calls')
    expect(end?.usage).toEqual({ input: 0, output: 7, total: 7 })
    const maxed = parseAnthropicEvent('{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}')
    expect(maxed?.finish).toBe('length')
    expect(parseAnthropicEvent('{"type":"ping"}')).toBeNull()
    expect(parseAnthropicEvent('{"type":"content_block_start","index":0,"content_block":{"type":"text"}}')).toBeNull()
  })
})

describe('listing Anthropic models', () => {
  it('uses the native headers and the display names, sorted', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [
      { type: 'model', id: 'claude-y', display_name: 'Claude Z' },
      { type: 'model', id: 'claude-x', display_name: 'Claude X' },
    ] }))
    expect(await listAnthropicModels('https://api.anthropic.com/v1', 'sk-a')).toEqual([{ id: 'claude-x', name: 'Claude X' }, { id: 'claude-y', name: 'Claude Z' }])
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(init.headers['x-api-key']).toBe('sk-a')
    expect(init.headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(init.headers.authorization).toBeUndefined()
  })
  it('reports a rejected key as badkey', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, {}))
    await expect(listAnthropicModels('https://api.anthropic.com/v1', 'bad')).rejects.toMatchObject({ kind: 'badkey' })
  })
})
