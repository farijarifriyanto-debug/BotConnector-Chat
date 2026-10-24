import './helpers/mocks'
import Storage from 'expo-sqlite/kv-store'
import { instructionPrompt, instructionLabel, readInstructions } from '../src/lib/instructions'
import { composedSystem } from '../src/lib/conv'
import { instructionBlock, useInstructions } from '../src/store/instructions'
import type { Conv } from '../src/lib/types'

const blank = (): Conv => ({ id: 'c1', title: 't', model: 'm', system: '', web: false, createdAt: 0, updatedAt: 0, messages: [] })

beforeEach(() => {
  useInstructions.setState({ items: [], active: [] })
})

describe('instruction injection', () => {
  it('joins only the switched-on prompts, in list order, separated by a blank line', () => {
    const items = [
      { id: 'a', title: 'A', prompt: 'Answer in Indonesian.' },
      { id: 'b', title: 'B', prompt: '  ' },
      { id: 'c', title: 'C', prompt: 'Cite sources.\n' },
    ]
    expect(instructionPrompt(items, ['c', 'a'])).toBe('Answer in Indonesian.\n\nCite sources.')
    expect(instructionPrompt(items, [])).toBe('')
    expect(instructionPrompt(items, ['b'])).toBe('')
    expect(instructionPrompt([], ['a'])).toBe('')
  })

  it('names an untitled card by its first line', () => {
    expect(instructionLabel({ id: 'a', title: 'Aturan', prompt: 'x' })).toBe('Aturan')
    expect(instructionLabel({ id: 'a', title: '  ', prompt: '\nJawab singkat.\nLalu detail.' })).toBe('Jawab singkat.')
    expect(instructionLabel({ id: 'a', title: '', prompt: '   ' })).toBe('')
  })

  it('keeps only rows it can show again after a restart', () => {
    const rows = readInstructions({ items: [
      { id: 'a', title: 'ok', prompt: 'p' },
      { title: 'no id', prompt: 'p' },
      { id: 'b', prompt: 'p' },
      null,
      42,
    ] })
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toEqual({ id: 'a', title: 'ok', prompt: 'p' })
    expect(readInstructions(null)).toEqual([])
    expect(readInstructions({ items: 'nope' })).toEqual([])
  })

  it('the system message ends with the cards, after memory, project and chat instructions', () => {
    const mem: Conv = { ...blank(), id: 'bc-memory-v1', kind: 'memory', system: 'Be brief.' }
    const chat: Conv = { ...blank(), system: 'You are a helper.' }
    expect(composedSystem(chat, [mem, chat], 'Answer in Indonesian.')).toBe(
      'The user\'s standing instructions:\nBe brief.\n\nYou are a helper.\n\nAnswer in Indonesian.',
    )
    expect(composedSystem(chat, [mem, chat], '   ')).toBe('The user\'s standing instructions:\nBe brief.\n\nYou are a helper.')
  })
})

describe('instruction store', () => {
  it('adds, edits, switches and removes cards, and remembers them', () => {
    const s = () => useInstructions.getState()
    const id = s().add('  Aturan  ', 'Answer in Indonesian.')
    expect(s().items).toEqual([{ id, title: '  Aturan  ', prompt: 'Answer in Indonesian.' }])
    expect(s().active).toEqual([])

    s().toggle(id)
    expect(s().active).toEqual([id])
    expect(instructionBlock()).toBe('Answer in Indonesian.')

    s().update(id, { prompt: 'Cite sources.' })
    expect(s().items[0].prompt).toBe('Cite sources.')
    expect(instructionBlock()).toBe('Cite sources.')

    s().toggle(id)
    expect(instructionBlock()).toBe('')

    // a restart reads the same blob back
    const blob = JSON.parse(Storage.getItemSync('bc.instr.v1') ?? '{}')
    expect(blob.items[0].prompt).toBe('Cite sources.')

    s().toggle(id)
    s().remove(id)
    expect(s().items).toEqual([])
    expect(s().active).toEqual([])
    expect(JSON.parse(Storage.getItemSync('bc.instr.v1') ?? '{}').active).toEqual([])
  })

  it('caps a card at the same lengths the inputs allow and drops stale active ids', () => {
    const s = () => useInstructions.getState()
    const id = s().add('t'.repeat(200), 'p'.repeat(5000))
    expect(s().items[0].title).toHaveLength(80)
    expect(s().items[0].prompt).toHaveLength(4000)
    s().setActive([id, 'ghost'])
    expect(s().active).toEqual([id])
    s().remove(id)
    expect(s().active).toEqual([])
  })
})
