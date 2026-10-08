// Models that run well on a phone. Sizes are the real file sizes (checked on Hugging Face).
export interface Recommended { name: string; repo: string; file: string; bytes: number; note: 'tiny' | 'small' | 'medium' }
export const RECOMMENDED: Recommended[] = [
  { name: 'Qwen3 0.6B', repo: 'Qwen/Qwen3-0.6B-GGUF', file: 'Qwen3-0.6B-Q8_0.gguf', bytes: 639446688, note: 'tiny' },
  { name: 'Llama 3.2 1B Instruct', repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF', file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', bytes: 807694464, note: 'tiny' },
  { name: 'Gemma 3 1B', repo: 'unsloth/gemma-3-1b-it-GGUF', file: 'gemma-3-1b-it-Q4_K_M.gguf', bytes: 806058272, note: 'tiny' },
  { name: 'Qwen3 1.7B', repo: 'unsloth/Qwen3-1.7B-GGUF', file: 'Qwen3-1.7B-Q4_K_M.gguf', bytes: 1107409472, note: 'small' },
  { name: 'Llama 3.2 3B Instruct', repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF', file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', bytes: 2019377696, note: 'medium' },
  { name: 'Qwen3 4B', repo: 'unsloth/Qwen3-4B-GGUF', file: 'Qwen3-4B-Q4_K_M.gguf', bytes: 2497281312, note: 'medium' },
]
