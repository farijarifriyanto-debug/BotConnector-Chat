import * as FileSystem from 'expo-file-system/legacy'
import { transcribeAudio } from '../api/api'
import { ChatError } from './types'

export interface AudioFormat { mime: string; format: string }
const FORMATS: Record<string, AudioFormat> = {
  m4a: { mime: 'audio/m4a', format: 'm4a' },
  mp4: { mime: 'audio/mp4', format: 'm4a' },
  wav: { mime: 'audio/wav', format: 'wav' },
  webm: { mime: 'audio/webm', format: 'webm' },
  '3gp': { mime: 'audio/3gpp', format: '3gp' },
  aac: { mime: 'audio/aac', format: 'aac' },
  mp3: { mime: 'audio/mpeg', format: 'mp3' },
}

/** The mime/extension the transcription service should hear, from the file the recorder wrote. */
export function audioFormatFor(uri: string): AudioFormat {
  const path = uri.split(/[?#]/)[0]
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return FORMATS[ext] ?? FORMATS.m4a
}

const PUNCT = /^[,.;:!?…'")\]}»”’]/
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/

/**
 * Spoken words go after what is already typed in the message box, like the reference app:
 * one space between words, none before punctuation, none inside CJK text.
 */
export function joinVoiceText(base: string, spoken: string): string {
  const said = spoken.trim()
  if (!said) return base
  if (!base || /\s$/.test(base)) return base + said
  const first = said[0], last = base[base.length - 1]
  const gap = PUNCT.test(first) || CJK.test(first) || CJK.test(last) ? '' : ' '
  return base + gap + said
}

export type VoiceFailure = 'aborted' | 'mic' | 'balance' | 'auth' | 'network' | 'unavailable' | 'failed'

/** What went wrong, so the composer can say it in the person's language. */
export function voiceFailure(e: unknown): VoiceFailure {
  if (e instanceof ChatError) {
    if (e.kind === 'aborted') return 'aborted'
    if (e.kind === 'balance') return 'balance'
    if (e.kind === 'auth') return 'auth'
    if (e.kind === 'network') return 'network'
    if (e.kind === 'unavailable' || e.kind === 'capacity' || e.kind === 'quota' || e.kind === 'plan' || e.kind === 'rejected') return 'unavailable'
    return 'failed'
  }
  const message = String((e as Error)?.message ?? e).toLowerCase()
  if (message.includes('microphone') || message.includes('permission')) return 'mic'
  return 'failed'
}

export interface VoiceDeps {
  readBase64(uri: string): Promise<string>
  transcribe(req: { audioBase64: string; mime: string; format: string; language?: string }, signal?: AbortSignal): Promise<{ text: string; durationSeconds: number | null }>
}

const defaultDeps: VoiceDeps = {
  readBase64: uri => FileSystem.readAsStringAsync(uri, { encoding: 'base64' }),
  transcribe: (req, signal) => transcribeAudio(req, signal),
}

/** Reads the recording and sends it to the transcription service; the words come back trimmed. */
export async function transcribeClip(uri: string, opts: { language?: string; signal?: AbortSignal; deps?: Partial<VoiceDeps> } = {}): Promise<{ text: string; durationSeconds: number | null }> {
  const deps = { ...defaultDeps, ...(opts.deps ?? {}) }
  const { mime, format } = audioFormatFor(uri)
  const audioBase64 = await deps.readBase64(uri)
  const r = await deps.transcribe({ audioBase64, mime, format, ...(opts.language ? { language: opts.language } : {}) }, opts.signal)
  return { text: r.text.trim(), durationSeconds: r.durationSeconds }
}
