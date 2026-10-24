/**
 * Local (non-web) built-in tools, grouped the way the reference app groups its Tool
 * Descriptions page: Memory and Device tools. Definitions follow the reference schemas
 * (`memory_tools.dart`, `local_tools_service.dart`), narrowed honestly to what this app
 * actually stores: a flat list of memory facts and a flat profile of standing instructions.
 */
import { sha256 } from 'js-sha256'
import type { ToolDef } from '../toolSchema'

export type ToolGroup = 'search' | 'memory' | 'device'

/** How the tools reach the app; the chat store supplies it, so lib code stays free of stores. */
export interface LocalContext {
  memory(): string[]
  saveMemory(next: string[]): Promise<void>
  clipboardRead(): Promise<string>
  clipboardWrite(text: string): Promise<void>
  /** speaks the text with the phone's own voice, like the reference app's text-to-speech tool */
  speak(text: string): void
  /** past chats that mention every keyword; the chat store decides which chats may be searched */
  searchChats(query: string, limit: number, conversationId?: string): ChatHit[]
}

/** One past conversation that matched chat_search. */
export interface ChatHit { conversationId: string; title: string; updatedAt: number; snippets: string[] }

export const MEMORY_MAX = 100, MEMORY_ITEM_MAX = 400
/** Stable id derived from the fact itself: no storage change, and the model gets an id to edit or delete. */
export const memoryId = (text: string): string => `mem_${sha256(text).slice(0, 8)}`

export const MEMORY_TOOLS: ToolDef[] = [
  { type: 'function', function: {
    name: 'memory_read',
    description: 'Read the long-term memory the user keeps on this phone. Returns every saved fact with its id; give the id back to memory_edit or memory_delete. Only a summary may be in the conversation, so call this when you need the exact facts or an id.',
    parameters: { type: 'object', properties: {}, } } },
  { type: 'function', function: {
    name: 'memory_update',
    description: 'Save one long-term fact about the user. Only write stable facts that will still hold in a future conversation; do not write ephemeral context from this chat.',
    parameters: { type: 'object', properties: {
      content: { type: 'string', description: 'One complete, self-contained third-person statement, e.g. "The user prefers short, direct answers in Indonesian."' },
    }, required: ['content'] } } },
  { type: 'function', function: {
    name: 'memory_edit',
    description: 'Replace the content of an existing memory. First obtain the id (mem_xxxxxxxx) via memory_read. Use only when the content is outdated or wrong; for new information use memory_update.',
    parameters: { type: 'object', properties: {
      id: { type: 'string', description: 'Entry id, e.g. mem_a1b2c3d4.' },
      content: { type: 'string', description: 'The full replacement content.' },
    }, required: ['id', 'content'] } } },
  { type: 'function', function: {
    name: 'memory_delete',
    description: 'Remove a memory the user no longer wants kept. First obtain the id via memory_read. Use only when the user clearly says the fact no longer holds.',
    parameters: { type: 'object', properties: {
      id: { type: 'string', description: 'Entry id, e.g. mem_a1b2c3d4.' },
    }, required: ['id'] } } },
  { type: 'function', function: {
    name: 'memory_search_profile',
    description: 'Search the long-term memory by keywords. Use when you need a specific fact and the conversation does not already contain it. Every keyword must appear; matching ignores case.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords separated by spaces.' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of entries to return. Default 10.' },
    }, required: ['query'] } } },
  { type: 'function', function: {
    name: 'chat_search',
    description: 'Search message content in past conversations by keywords. Prefer this when recalling an earlier discussion, or when the user says "last time", "earlier", or "we discussed". The current conversation is excluded because it is already in context.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords separated by spaces.' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of results. Default 10.' },
      conversation_id: { type: 'string', description: 'Search only within this conversation. Omit to search every other chat on this phone.' },
    }, required: ['query'] } } },
]

export const DEVICE_TOOLS: ToolDef[] = [
  { type: 'function', function: {
    name: 'get_time_info',
    description: 'Get the current local date and time info from the device. Returns year, month, day, weekday, ISO date and time strings, timezone, UTC offset, and timestamp.',
    parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: {
    name: 'clipboard_tool',
    description: 'Read or write plain text from the device clipboard. Use action: read or write. For write, provide text. Do NOT write to the clipboard unless the user has explicitly requested it.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['read', 'write'], description: 'Operation to perform: read or write' },
      text: { type: 'string', description: 'Text to write to the clipboard. Required for write.' },
    }, required: ['action'] } } },
  { type: 'function', function: {
    name: 'text_to_speech',
    description: 'Speak text aloud to the user using the phone\'s text-to-speech. Use when the user asks you to read something aloud, or when audio output is appropriate. The tool returns once playback has been requested; audio may continue in the background. Provide natural, readable text without markdown formatting.',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'The text to speak aloud.' },
    }, required: ['text'] } } },
  { type: 'function', function: {
    name: 'calculate',
    description: 'Evaluate a mathematical expression with decimal arithmetic. Supports + - * / % ^ !, parentheses, sin() cos() tan() (radians), sqrt() ln() abs() floor() ceil() sgn(), log(base, value), constants pi e. Example: "5!", "sin(pi/4)", "log(2, 8)", "floor(3.7)"',
    parameters: { type: 'object', properties: {
      expression: { type: 'string', description: 'A mathematical expression in standard notation, e.g. "(15 + 3) * 2", "2^10", "sqrt(144)"' },
    }, required: ['expression'] } } },
]

export const LOCAL_GROUPS: { group: ToolGroup; defs: ToolDef[] }[] = [
  { group: 'memory', defs: MEMORY_TOOLS },
  { group: 'device', defs: DEVICE_TOOLS },
]

const isMemory = (n: string) => MEMORY_TOOLS.some(d => d.function.name === n)
const isDevice = (n: string) => DEVICE_TOOLS.some(d => d.function.name === n)
export const isLocalTool = (n: string) => isMemory(n) || isDevice(n)

const fail = (message: string): string => JSON.stringify({ error: message })

// ---------------------------------------------------------------- calculate

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string }
const tokenize = (src: string): Tok[] => {
  const out: Tok[] = []
  for (let i = 0; i < src.length;) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i))
      if (!m) throw new Error(`Unexpected character "${c}"`)
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    if (/[a-zA-Z]/.test(c)) {
      const m = /^[a-zA-Z]+/.exec(src.slice(i))!
      out.push({ t: 'op', v: m[0].toLowerCase() }); i += m[0].length; continue
    }
    if ('+-*/%^!(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`Unexpected character "${c}"`)
  }
  return out
}

const factorial = (n: number): number => {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial needs a whole number from 0 to 170')
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/** Recursive-descent evaluator; functions take radians like the reference app. */
export function evaluate(expression: string): number {
  const toks = tokenize(expression)
  let pos = 0
  const peek = () => toks[pos]
  const eat = (v: string) => { if (peek()?.v !== v) throw new Error(`Expected "${v}"`); pos++ }
  const expr = (): number => {
    let left = term()
    while (peek()?.v === '+' || peek()?.v === '-') { const op = toks[pos++].v; const r = term(); left = op === '+' ? left + r : left - r }
    return left
  }
  const term = (): number => {
    let left = power()
    while (peek()?.v === '*' || peek()?.v === '/' || peek()?.v === '%') {
      const op = toks[pos++].v, r = power()
      if ((op === '/' || op === '%') && r === 0) throw new Error('Division by zero')
      left = op === '*' ? left * r : op === '/' ? left / r : left % r
    }
    return left
  }
  const power = (): number => {
    const base = unary()
    if (peek()?.v === '^') { pos++; return Math.pow(base, power()) }
    return base
  }
  const unary = (): number => {
    if (peek()?.v === '-') { pos++; return -unary() }
    if (peek()?.v === '+') { pos++; return unary() }
    return postfix()
  }
  const postfix = (): number => {
    let v = atom()
    while (peek()?.v === '!') { pos++; v = factorial(v) }
    return v
  }
  const callArgs = (): number[] => {
    const args: number[] = []
    if (peek()?.v === ')') { pos++; return args }
    args.push(expr())
    while (peek()?.v === ',') { pos++; args.push(expr()) }
    eat(')')
    return args
  }
  const atom = (): number => {
    const tok = peek()
    if (!tok) throw new Error('The expression ends too early')
    if (tok.t === 'num') { pos++; return tok.v }
    if (tok.v === '(') { pos++; const v = expr(); eat(')'); return v }
    const name = tok.v
    pos++
    if (name === 'pi') return Math.PI
    if (name === 'e') return Math.E
    eat('(')
    const args = callArgs()
    const one = () => { if (args.length !== 1) throw new Error(`"${name}" needs one value`); return args[0] }
    switch (name) {
      case 'sin': return Math.sin(one())
      case 'cos': return Math.cos(one())
      case 'tan': return Math.tan(one())
      case 'sqrt': { const v = one(); if (v < 0) throw new Error('sqrt of a negative number'); return Math.sqrt(v) }
      case 'ln': { const v = one(); if (v <= 0) throw new Error('ln needs a value above 0'); return Math.log(v) }
      case 'abs': return Math.abs(one())
      case 'floor': return Math.floor(one())
      case 'ceil': return Math.ceil(one())
      case 'round': return Math.round(one())
      case 'sgn': return Math.sign(one())
      case 'log': { if (args.length !== 2) throw new Error('"log" needs a base and a value'); return Math.log(args[1]) / Math.log(args[0]) }
      default: throw new Error(`Unknown function "${name}"`)
    }
  }
  const value = expr()
  if (pos !== toks.length) throw new Error('Unexpected text after the expression')
  return value
}

/** 15 significant digits, without the float noise of e.g. 0.30000000000000004. */
export const formatNumber = (n: number): string => {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n)
  return String(Number(n.toPrecision(15)))
}

// ---------------------------------------------------------------- dispatch

export async function runLocalTool(name: string, args: Record<string, unknown>, ctx: LocalContext): Promise<string> {
  if (isMemory(name)) {
    const facts = ctx.memory().map(text => ({ id: memoryId(text), content: text }))
    if (name === 'memory_read') return JSON.stringify({ total: facts.length, entries: facts })
    const content = typeof args.content === 'string' ? args.content.trim() : ''
    if (name === 'memory_update') {
      if (!content) return fail('content is required')
      const text = content.slice(0, MEMORY_ITEM_MAX)
      if (ctx.memory().includes(text)) return JSON.stringify({ saved: false, reason: 'already stored', id: memoryId(text) })
      const next = [...ctx.memory(), text].slice(-MEMORY_MAX)
      await ctx.saveMemory(next)
      return JSON.stringify({ saved: true, id: memoryId(text), total: next.length })
    }
    if (name === 'memory_edit') {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const entries = ctx.memory()
      const at = entries.findIndex(text => memoryId(text) === id)
      if (!id || at < 0) return fail('unknown id; call memory_read for the current ids')
      if (!content) return fail('content is required')
      const next = [...entries]
      next[at] = content.slice(0, MEMORY_ITEM_MAX)
      await ctx.saveMemory(next)
      return JSON.stringify({ saved: true, id: memoryId(next[at]) })
    }
    if (name === 'memory_search_profile') {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) return fail('query is required')
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20)
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
      const hits = ctx.memory().filter(text => { const low = text.toLowerCase(); return keywords.every(k => low.includes(k)) })
      return JSON.stringify({ total: hits.length, entries: hits.slice(0, limit).map(text => ({ id: memoryId(text), content: text })) })
    }
    if (name === 'chat_search') {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) return fail('query is required')
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20)
      const only = typeof args.conversation_id === 'string' && args.conversation_id.trim() ? args.conversation_id.trim() : undefined
      const hits = ctx.searchChats(query, limit, only)
      return JSON.stringify({
        total: hits.length,
        results: hits.map(h => ({ conversation_id: h.conversationId, title: h.title, updated_at: new Date(h.updatedAt).toISOString(), snippets: h.snippets })),
      })
    }
    const id = typeof args.id === 'string' ? args.id.trim() : ''
    const at = ctx.memory().findIndex(text => memoryId(text) === id)
    if (!id || at < 0) return fail('unknown id; call memory_read for the current ids')
    const next = ctx.memory().filter((_, i) => i !== at)
    await ctx.saveMemory(next)
    return JSON.stringify({ removed: true, total: next.length })
  }

  if (name === 'text_to_speech') {
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text) return fail('text is required')
    ctx.speak(text)
    return JSON.stringify({ spoken: true, characters: text.length })
  }

  if (name === 'get_time_info') {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const offsetMin = -now.getTimezoneOffset()
    const sign = offsetMin >= 0 ? '+' : '-'
    return JSON.stringify({
      year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
      weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
      isoDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      isoTime: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      utcOffset: `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`,
      timestamp: now.getTime(),
    })
  }

  if (name === 'clipboard_tool') {
    const action = typeof args.action === 'string' ? args.action : ''
    if (action === 'read') return JSON.stringify({ text: await ctx.clipboardRead() })
    if (action === 'write') {
      const text = typeof args.text === 'string' ? args.text : ''
      if (!text) return fail('text is required for action write')
      await ctx.clipboardWrite(text)
      return JSON.stringify({ written: true, length: text.length })
    }
    return fail('action must be "read" or "write"')
  }

  if (name === 'calculate') {
    const expression = typeof args.expression === 'string' ? args.expression.trim() : ''
    if (!expression) return fail('expression is required')
    try {
      const value = evaluate(expression)
      return JSON.stringify({ expression, result: formatNumber(value) })
    } catch (e) { return fail((e as Error).message) }
  }

  return fail(`unknown tool "${name}"`)
}
