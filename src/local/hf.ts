// Hugging Face lookups for GGUF models. Public endpoints; an optional user token unlocks gated repos.
import { fetch } from 'expo/fetch'

const HF = 'https://huggingface.co'
export interface HfRepo { id: string; downloads: number; likes: number }
export interface HfFile { path: string; bytes: number; quant: string }

const auth = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {})

/** "Q4_K_M", "IQ3_XS", "Q8_0", "BF16" ... from a GGUF file name. */
export function quantOf(file: string): string {
  const m = file.replace(/\.gguf$/i, '').match(/(?:^|[-_.])((?:I?Q\d(?:_[A-Z0-9]+)*)|BF16|F16|F32)(?=$|[-_.])/i)
  return m ? m[1].toUpperCase() : ''
}
export const isModelFile = (path: string) => /\.gguf$/i.test(path) && !/mmproj/i.test(path) && !/-0000\d-of-\d+/.test(path)   // projectors and split shards are not stand-alone models

/** Accepts "owner/repo", a huggingface.co repo URL, or a direct .../resolve/.../file.gguf link. */
export function parseSource(input: string): { repo: string; file?: string } | null {
  const s = input.trim()
  const direct = s.match(/^https?:\/\/(?:www\.)?huggingface\.co\/([^/\s]+\/[^/\s]+)\/(?:resolve|blob)\/[^/\s]+\/(.+?\.gguf)(?:\?.*)?$/i)
  if (direct) return { repo: direct[1], file: decodeURIComponent(direct[2]) }
  const repoUrl = s.match(/^https?:\/\/(?:www\.)?huggingface\.co\/([^/\s]+\/[^/\s?#]+)/i)
  if (repoUrl) return { repo: repoUrl[1] }
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? { repo: s } : null
}
export const downloadUrl = (repo: string, file: string) => `${HF}/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`

export async function searchRepos(query: string, token?: string, signal?: AbortSignal): Promise<HfRepo[]> {
  const q = new URLSearchParams({ search: query.trim(), filter: 'gguf', sort: 'downloads', direction: '-1', limit: '25' })
  const r = await fetch(`${HF}/api/models?${q}`, { headers: { accept: 'application/json', ...auth(token) }, signal })
  if (!r.ok) throw new Error(`hf ${r.status}`)
  const j: any = await r.json()
  return (Array.isArray(j) ? j : []).filter(x => typeof x?.id === 'string').map(x => ({ id: x.id, downloads: Number(x.downloads) || 0, likes: Number(x.likes) || 0 }))
}

export async function listFiles(repo: string, token?: string, signal?: AbortSignal): Promise<HfFile[]> {
  const r = await fetch(`${HF}/api/models/${repo}/tree/main`, { headers: { accept: 'application/json', ...auth(token) }, signal })
  if (r.status === 401 || r.status === 403) throw new Error('gated')
  if (!r.ok) throw new Error(`hf ${r.status}`)
  const j: any = await r.json()
  return (Array.isArray(j) ? j : []).filter(x => x?.type === 'file' && typeof x.path === 'string' && isModelFile(x.path))
    .map(x => ({ path: x.path as string, bytes: Number(x.lfs?.size ?? x.size) || 0, quant: quantOf(x.path) }))
    .sort((a, b) => a.bytes - b.bytes)
}
