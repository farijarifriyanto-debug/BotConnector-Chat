import './helpers/mocks'
import { isModelFile, parseSource, quantOf, downloadUrl } from '../src/local/hf'
import { DEFAULT_PARAMS, sanitize } from '../src/local/params'
import { streamCompletion } from '../src/api/api'
import '../src/local/engine'

jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
const mockInit = jest.fn()
jest.mock('llama.rn', () => ({ initLlama: (...a: unknown[]) => mockInit(...a) }), { virtual: true })

describe('hugging face helpers', () => {
  it('reads owner/repo, repo urls and direct file links', () => {
    expect(parseSource('Qwen/Qwen3-0.6B-GGUF')).toEqual({ repo: 'Qwen/Qwen3-0.6B-GGUF' })
    expect(parseSource('https://huggingface.co/unsloth/Qwen3-4B-GGUF')).toEqual({ repo: 'unsloth/Qwen3-4B-GGUF' })
    expect(parseSource('https://huggingface.co/a/b/resolve/main/sub/m-Q4_K_M.gguf?download=true')).toEqual({ repo: 'a/b', file: 'sub/m-Q4_K_M.gguf' })
    expect(parseSource('hello world')).toBeNull(); expect(parseSource('')).toBeNull()
  })
  it('finds the quantisation and skips projectors and shards', () => {
    expect(quantOf('Qwen3-1.7B-Q4_K_M.gguf')).toBe('Q4_K_M'); expect(quantOf('x-IQ3_XS.gguf')).toBe('IQ3_XS'); expect(quantOf('m-BF16.gguf')).toBe('BF16'); expect(quantOf('plain.gguf')).toBe('')
    expect(isModelFile('a-Q4_K_M.gguf')).toBe(true); expect(isModelFile('mmproj-F16.gguf')).toBe(false); expect(isModelFile('a-00001-of-00003.gguf')).toBe(false); expect(isModelFile('README.md')).toBe(false)
  })
  it('builds a download url that survives sub folders and spaces', () => {
    expect(downloadUrl('a/b', 'sub dir/m.gguf')).toBe('https://huggingface.co/a/b/resolve/main/sub%20dir/m.gguf')
  })
})

describe('local params', () => {
  it('falls back to defaults and clamps wild stored values', () => {
    expect(sanitize(undefined)).toEqual(DEFAULT_PARAMS)
    expect(sanitize({ nCtx: 999999, nPredict: -5, temperature: 9, topP: 0, gpu: 'yes' })).toMatchObject({ nCtx: 32768, nPredict: 16, temperature: 2, topP: 0.05, gpu: true })
  })
})

describe('on-device engine', () => {
  it('loads the model once, streams reasoning and text, and forwards abort to llama', async () => {
    const { useLocal } = require('../src/local/store') as typeof import('../src/local/store')
    useLocal.setState({ models: [{ id: 'local:m.gguf', name: 'M', file: 'm.gguf', bytes: 1, addedAt: 0 }] })
    const stop = jest.fn(async () => {}), release = jest.fn(async () => {})
    const completion = jest.fn(async (_p: unknown, cb: (d: unknown) => void) => { cb({ token: 'a', reasoning_content: 'hm' }); cb({ token: 'b', content: 'Ha' }); cb({ token: 'c', content: 'lo' }); return { text: 'Halo' } })
    mockInit.mockResolvedValue({ completion, stopCompletion: stop, release })
    const run = async () => { const out: string[] = []; let think = ''; for await (const d of streamCompletion({ model: 'local:m.gguf', max_tokens: 99999, messages: [{ role: 'system', content: 'S' }, { role: 'user', content: [{ type: 'text', text: 'hai' }] }] })) { if (d.content) out.push(d.content); if (d.reasoning) think += d.reasoning } return { text: out.join(''), think } }
    expect(await run()).toEqual({ text: 'Halo', think: 'hm' })
    await run()
    expect(mockInit).toHaveBeenCalledTimes(1)   // second chat reuses the loaded model
    expect(mockInit.mock.calls[0][0]).toMatchObject({ model: 'file:///docs/models/m.gguf', n_gpu_layers: 99 })
    const p = (completion.mock.calls[0] as any)[0]
    expect(p.messages).toEqual([{ role: 'system', content: 'S' }, { role: 'user', content: 'hai' }]); expect(p.n_predict).toBe(1024)   // capped by the user's setting
  })
  it('refuses a model that is no longer installed instead of using the cloud', async () => {
    const { useLocal } = require('../src/local/store') as typeof import('../src/local/store')
    useLocal.setState({ models: [] })
    await expect((async () => { for await (const _ of streamCompletion({ model: 'local:gone.gguf', messages: [] })) { /* none */ } })()).rejects.toMatchObject({ kind: 'rejected' })
  })
})
