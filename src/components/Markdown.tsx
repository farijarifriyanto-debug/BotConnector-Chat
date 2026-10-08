import * as Clipboard from 'expo-clipboard'
import { marked, type Token, type Tokens } from 'marked'
import React, { memo, useMemo, useState } from 'react'
import { Linking, Platform, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import { chartDataFromRows } from '../lib/chart'
import { t } from '../i18n/strings'
import { useSettings } from '../store/settings'
import { useTheme, type Theme } from '../theme/theme'
import type { Source } from '../lib/types'
import { TableChart } from './TableChart'

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const plain = (tokens: Token[] | undefined): string => (tokens ?? []).map(k => ('tokens' in k && k.tokens ? plain(k.tokens as Token[]) : decode(('text' in k ? String((k as { text?: string }).text ?? '') : '')))).join('')
const safeUrl = (u: string) => /^(https?:|mailto:)/i.test(u)
const open = (u: string) => { if (safeUrl(u)) void Linking.openURL(u).catch(() => {}) }

interface Ctx { th: Theme; sources: Source[]; lang: 'id' | 'en' }

/** "[3]" in the answer becomes a pill that opens source 3 (numbers with no source are left as text). */
function withCitations(text: string, c: Ctx, key: string): React.ReactNode[] {
  if (!c.sources.length) return [text]
  return text.split(/(\[\d{1,3}\])/g).map((part, i) => {
    const n = /^\[(\d{1,3})\]$/.exec(part)?.[1], s = n ? c.sources[Number(n) - 1] : undefined
    if (!s || !safeUrl(s.url)) return part
    return <Text key={`${key}-c${i}`} accessibilityRole="link" accessibilityLabel={s.title || s.url} onPress={() => open(s.url)} style={{ color: c.th.accentStrong, backgroundColor: c.th.accentSoft, fontSize: 12, fontWeight: '700' }}>{` ${n} `}</Text>
  })
}

function inline(tokens: Token[] | undefined, c: Ctx, key: string): React.ReactNode[] {
  return (tokens ?? []).map((k, i) => {
    const kk = `${key}-${i}`
    switch (k.type) {
      case 'strong': return <Text key={kk} style={{ fontWeight: '700' }}>{inline((k as Tokens.Strong).tokens, c, kk)}</Text>
      case 'em': return <Text key={kk} style={{ fontStyle: 'italic' }}>{inline((k as Tokens.Em).tokens, c, kk)}</Text>
      case 'del': return <Text key={kk} style={{ textDecorationLine: 'line-through' }}>{inline((k as Tokens.Del).tokens, c, kk)}</Text>
      case 'codespan': return <Text key={kk} style={{ fontFamily: MONO, fontSize: 14, backgroundColor: c.th.surface3 }}>{` ${decode((k as Tokens.Codespan).text)} `}</Text>
      case 'br': return '\n'
      case 'link': { const l = k as Tokens.Link; return <Text key={kk} accessibilityRole="link" onPress={() => open(l.href)} style={{ color: c.th.accentStrong, textDecorationLine: 'underline' }}>{inline(l.tokens, c, kk)}</Text> }
      case 'image': return decode((k as Tokens.Image).text)   // model-written images are never loaded (tracking pixels)
      case 'escape': case 'text': { const tt = k as Tokens.Text; return tt.tokens?.length ? <Text key={kk}>{inline(tt.tokens, c, kk)}</Text> : <Text key={kk}>{withCitations(decode(tt.text), c, kk)}</Text> }
      default: return decode('text' in k ? String((k as { text?: string }).text ?? '') : '')
    }
  })
}

function CodeBlock({ code, lang, c }: { code: string; lang?: string; c: Ctx }) {
  const [done, setDone] = useState(false)
  return (
    <View style={{ marginVertical: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.th.lineStrong, backgroundColor: c.th.surface2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.th.surface3 }}>
        <Text style={{ color: c.th.muted, fontSize: 12 }}>{lang || 'code'}</Text>
        <Pressable accessibilityRole="button" onPress={() => { void Clipboard.setStringAsync(code); setDone(true); setTimeout(() => setDone(false), 1500) }} hitSlop={8}>
          <Text style={{ color: c.th.accentStrong, fontSize: 12, fontWeight: '700' }}>{done ? t(c.lang, 'copied') : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator><Text selectable style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: c.th.ink, padding: 12 }}>{code}</Text></ScrollView>
    </View>
  )
}

function TableBlock({ tok, c, key0 }: { tok: Tokens.Table; c: Ctx; key0: string }) {
  const [chart, setChart] = useState(false)
  const data = useMemo(() => chartDataFromRows(tok.header.map(h => plain(h.tokens)), tok.rows.map(r => r.map(x => plain(x.tokens))), c.lang === 'id'), [tok, c.lang])
  const cell = (tokens: Token[], head: boolean, k: string, last: boolean) => (
    <View key={k} style={{ minWidth: 96, maxWidth: 240, padding: 8, borderRightWidth: last ? 0 : 1, borderColor: c.th.lineStrong, backgroundColor: head ? c.th.surface3 : undefined }}>
      <Text style={{ color: c.th.ink, fontSize: 14, lineHeight: 20, fontWeight: head ? '700' : '400' }}>{inline(tokens, c, k)}</Text>
    </View>
  )
  return (
    <View key={key0} style={{ marginVertical: 8 }}>
      {data && <Pressable testID="table-chart-open" accessibilityRole="button" onPress={() => setChart(true)} style={{ alignSelf: 'flex-end', marginBottom: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: c.th.lineStrong, backgroundColor: c.th.surface }}>
        <Text style={{ color: c.th.accentStrong, fontSize: 12, fontWeight: '700' }}>{t(c.lang, 'chartBtn')}</Text></Pressable>}
      <ScrollView horizontal showsHorizontalScrollIndicator style={{ borderWidth: 1, borderColor: c.th.lineStrong, borderRadius: 10 }}>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.th.lineStrong }}>{tok.header.map((h, i) => cell(h.tokens, true, `${key0}-h${i}`, i === tok.header.length - 1))}</View>
          {tok.rows.map((r, ri) => <View key={`${key0}-r${ri}`} style={{ flexDirection: 'row', borderBottomWidth: ri === tok.rows.length - 1 ? 0 : 1, borderColor: c.th.line }}>{r.map((x, i) => cell(x.tokens, false, `${key0}-r${ri}c${i}`, i === r.length - 1))}</View>)}
        </View>
      </ScrollView>
      {data && <TableChart data={data} visible={chart} onClose={() => setChart(false)} />}
    </View>
  )
}

function blocks(tokens: Token[], c: Ctx, key: string, depth = 0): React.ReactNode[] {
  const body: TextStyle = { color: c.th.ink, fontSize: 16, lineHeight: 24 }
  return tokens.map((k, i) => {
    const kk = `${key}-${i}`
    switch (k.type) {
      case 'paragraph': return <Text key={kk} selectable style={[body, { marginVertical: 5 }]}>{inline((k as Tokens.Paragraph).tokens, c, kk)}</Text>
      case 'text': { const tt = k as Tokens.Text; return <Text key={kk} selectable style={body}>{tt.tokens ? inline(tt.tokens, c, kk) : decode(tt.text)}</Text> }
      case 'heading': { const h = k as Tokens.Heading; return <Text key={kk} selectable style={[body, { fontWeight: '700', fontSize: h.depth <= 1 ? 22 : h.depth === 2 ? 19 : 17, lineHeight: h.depth <= 1 ? 28 : 25, marginTop: 12, marginBottom: 4 }]}>{inline(h.tokens, c, kk)}</Text> }
      case 'code': { const cb = k as Tokens.Code; return <CodeBlock key={kk} code={cb.text} lang={cb.lang} c={c} /> }
      case 'blockquote': return <View key={kk} style={{ borderLeftWidth: 3, borderColor: c.th.accent, paddingLeft: 12, marginVertical: 6 }}>{blocks((k as Tokens.Blockquote).tokens, c, kk, depth)}</View>
      case 'hr': return <View key={kk} style={{ height: 1, backgroundColor: c.th.lineStrong, marginVertical: 12 }} />
      case 'list': { const l = k as Tokens.List; return (
        <View key={kk} style={{ marginVertical: 4, paddingLeft: depth ? 12 : 0 }}>
          {l.items.map((it, j) => (
            <View key={`${kk}-${j}`} style={{ flexDirection: 'row', marginVertical: 2 }}>
              <Text style={[body, { width: 26 }]}>{l.ordered ? `${(Number(l.start) || 1) + j}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{blocks(it.tokens, c, `${kk}-${j}`, depth + 1)}</View>
            </View>))}
        </View>) }
      case 'table': return <TableBlock key={kk} tok={k as Tokens.Table} c={c} key0={kk} />
      case 'space': return null
      case 'html': return <Text key={kk} style={body}>{decode((k as Tokens.HTML).text)}</Text>   // raw HTML in a model answer is shown as text, never run
      default: return null
    }
  })
}

/** Renders a model answer (streamed or finished). [n] citations are tappable when `sources` are given. */
export const Markdown = memo(function Markdown({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const th = useTheme(), lang = useSettings(s => s.lang)
  const tokens = useMemo(() => marked.lexer(text, { gfm: true, breaks: true }), [text])
  return <View>{blocks(tokens, { th, sources, lang }, 'md')}</View>
})
