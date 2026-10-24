import { streamCompletion } from '../api/api'

/** The reference app's translate prompt: one user message, no history, answer only the translation. */
export const DEFAULT_TRANSLATE_PROMPT = `You are a translation expert, skilled in translating various languages, and maintaining accuracy, faithfulness, and elegance in translation.
Next, I will send you text. Please translate it into {target_lang}, and return the translation result directly, without adding any explanations or other content.

Please translate the <source_text> section:
<source_text>
{source_text}
</source_text>`

/** The reference app's language list, with the English name that goes into the prompt. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Indonesian' },
  { code: 'zh-CN', name: 'Simplified Chinese' },
  { code: 'zh-TW', name: 'Traditional Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'ms', name: 'Malay' },
  { code: 'tr', name: 'Turkish' },
]

export const languageName = (code: string): string => LANGUAGES.find(l => l.code === code)?.name ?? code

/** A blank template falls back to the built-in prompt, like the reference app. */
export function buildPrompt(template: string, targetName: string, text: string): string {
  const base = template.trim() || DEFAULT_TRANSLATE_PROMPT
  return base.replaceAll('{target_lang}', targetName).replaceAll('{source_text}', text)
}

export interface TranslateDeps {
  stream: (body: Record<string, unknown>, signal?: AbortSignal) => AsyncIterable<{ content?: string }>
}

/**
 * The standalone translate box: one user message, the reference prompt, streaming text.
 * Like the reference page, the first chunk loses its leading whitespace so the result
 * does not start with a blank line.
 */
export async function translateText(
  o: { text: string; target: string; model: string; prompt?: string; think?: boolean; signal?: AbortSignal; onText: (text: string) => void },
  deps: Partial<TranslateDeps> = {},
): Promise<string> {
  const text = o.text.trim()
  if (!text) return ''
  const stream = deps.stream ?? streamCompletion
  const prompt = buildPrompt(o.prompt ?? '', languageName(o.target), text)
  let out = '', first = true
  for await (const d of stream({ model: o.model, messages: [{ role: 'user', content: prompt }], ...(o.think ? {} : { reasoning_effort: 'none' }) }, o.signal)) {
    if (!d.content) continue
    out += first ? d.content.replace(/^\s+/, '') : d.content
    first = false
    o.onText(out)
  }
  return out.trim()
}
