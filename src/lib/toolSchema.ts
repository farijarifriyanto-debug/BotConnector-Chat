/**
 * Tool Descriptions: the person may rewrite the wording of the built-in tools, nothing else.
 * Ported from the reference app (`ToolSchemaOverride` + `ToolSchemaOverrides.apply`): only
 * `function.description` and `properties.<path>.description` change, a blank value means
 * "use the built-in wording", and unknown tools or parameter paths are ignored.
 */
export interface ToolOverride {
  description?: string
  /** flattened parameter path -> description, e.g. `query` */
  params?: Record<string, string>
}

export interface ToolFunction {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

export interface ToolDef {
  type: 'function'
  function: ToolFunction
}

export interface ParamDescriptor {
  path: string
  type?: string
  defaultDescription?: string
}

type Dict = Record<string, unknown>
const asDict = (v: unknown): Dict | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Dict : null)

function walk(properties: Dict, prefix: string, out: ParamDescriptor[]): void {
  for (const [key, raw] of Object.entries(properties)) {
    const schema = asDict(raw)
    if (!schema) continue
    const path = prefix ? `${prefix}.${key}` : key
    out.push({ path, type: typeof schema.type === 'string' ? schema.type : undefined, defaultDescription: typeof schema.description === 'string' ? schema.description : undefined })
    const nested = asDict(schema.properties)
    if (nested) { walk(nested, path, out); continue }
    const items = asDict(schema.items)
    if (items) {
      const itemProps = asDict(items.properties)
      if (itemProps) walk(itemProps, `${path}.items`, out)
      else if (typeof items.description === 'string') out.push({ path: `${path}.items`, type: typeof items.type === 'string' ? items.type : undefined, defaultDescription: items.description })
    }
  }
}

/** Every parameter that carries a description, in the order the schema lists them. */
export function describeParams(def: ToolDef): ParamDescriptor[] {
  const parameters = asDict(def?.function?.parameters)
  const properties = asDict(parameters?.properties)
  if (!properties) return []
  const out: ParamDescriptor[] = []
  walk(properties, '', out)
  return out
}

const setParam = (parameters: Dict, path: string, description: string): boolean => {
  const segments = path.split('.')
  if (!segments.length || segments.some(s => !s)) return false
  let node: Dict = parameters
  for (const seg of segments) {
    if (seg === 'items') {
      const items = asDict(node.items)
      if (!items) return false
      node = items
      continue
    }
    const props = asDict(node.properties)
    if (!props) return false
    const next = asDict(props[seg])
    if (!next) return false
    node = next
  }
  node.description = description
  return true
}

/** Drops blank entries so "blank" always means "use the built-in wording". */
export const cleanOverride = (o?: ToolOverride): ToolOverride | undefined => {
  if (!o) return undefined
  const description = o.description?.trim() ? o.description : undefined
  const params = Object.fromEntries(Object.entries(o.params ?? {}).filter(([k, v]) => k.trim() && typeof v === 'string' && v.trim()))
  return description || Object.keys(params).length ? { ...(description ? { description } : {}), ...(Object.keys(params).length ? { params } : {}) } : undefined
}

/** The definitions to send: untouched entries keep their identity, so a no-op override costs nothing. */
export function applyOverrides(defs: ToolDef[], overrides: Record<string, ToolOverride>): ToolDef[] {
  if (!Object.keys(overrides).length) return defs
  let copied = false
  const out = [...defs]
  for (let i = 0; i < defs.length; i++) {
    const clean = cleanOverride(overrides[defs[i].function.name])
    if (!clean) continue
    const copy = JSON.parse(JSON.stringify(defs[i])) as ToolDef
    let changed = false
    if (clean.description) { copy.function.description = clean.description; changed = true }
    const parameters = asDict(copy.function.parameters)
    if (parameters) for (const [path, text] of Object.entries(clean.params ?? {})) if (setParam(parameters, path, text)) changed = true
    if (!changed) continue
    out[i] = copy
    copied = true
  }
  return copied ? out : defs
}

/** True when the card carries a wording that differs from the built-in one. */
export function isModified(def: ToolDef, o?: ToolOverride): boolean {
  const clean = cleanOverride(o)
  if (!clean) return false
  if (clean.description && clean.description.trim() !== def.function.description) return true
  const known = new Map(describeParams(def).map(p => [p.path, p.defaultDescription ?? '']))
  return Object.entries(clean.params ?? {}).some(([path, text]) => known.has(path) && text.trim() !== known.get(path)!.trim())
}

/** Keeps only what can be shown again after a restart. */
export function readOverrides(raw: unknown): Record<string, ToolOverride> {
  const source = asDict((raw as { tools?: unknown })?.tools) ?? {}
  const out: Record<string, ToolOverride> = {}
  for (const [name, value] of Object.entries(source)) {
    const o = asDict(value)
    if (!o) continue
    const description = typeof o.description === 'string' ? o.description.slice(0, 2000) : undefined
    const params: Record<string, string> = {}
    const rawParams = asDict(o.params)
    if (rawParams) for (const [path, text] of Object.entries(rawParams)) if (typeof text === 'string' && text.trim()) params[path.slice(0, 200)] = text.slice(0, 2000)
    const clean = cleanOverride({ ...(description ? { description } : {}), params })
    if (clean) out[name.slice(0, 100)] = clean
  }
  return out
}
