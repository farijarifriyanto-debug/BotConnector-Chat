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
