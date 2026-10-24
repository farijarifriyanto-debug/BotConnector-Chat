/**
 * Instruction Injection: saved prompt cards the person can switch on, whose text is
 * appended to the system message of every request. Ported from the reference app
 * (`InstructionInjectionProvider.promptFor`: active cards joined by a blank line, in
 * list order, empty ones dropped).
 */
export interface Instruction {
  id: string
  title: string
  prompt: string
}

export const INSTR_TITLE_MAX = 80, INSTR_PROMPT_MAX = 4000, INSTR_MAX = 50

/** The block appended to the system message; '' when nothing is switched on. */
export function instructionPrompt(items: Instruction[], active: string[]): string {
  const on = new Set(active)
  return items
    .filter(i => on.has(i.id))
    .map(i => (i.prompt ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Keeps only what the app can show again after a restart. */
export function readInstructions(raw: unknown): Instruction[] {
  const list = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : []
  const out: Instruction[] = []
  for (const row of list.slice(0, INSTR_MAX)) {
    const r = row as Partial<Instruction>
    if (typeof r?.id !== 'string' || !r.id) continue
    out.push({ id: r.id, title: String(r.title ?? '').slice(0, INSTR_TITLE_MAX), prompt: String(r.prompt ?? '').slice(0, INSTR_PROMPT_MAX) })
  }
  return out
}

/** The title shown in the list; an untitled card is named by its first line. */
export const instructionLabel = (i: Instruction): string => i.title.trim() || i.prompt.trim().split('\n')[0]?.trim() || ''
