import * as Clipboard from 'expo-clipboard'
import * as Speech from 'expo-speech'
import React, { memo, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, Share, View } from 'react-native'
import { Text } from './Text'
import { errorText, type Lang } from '../i18n/strings'
import { bcp47 } from '../i18n/langs'
import { useT } from '../hooks/useT'
import { imageUri } from '../lib/images'
import { plainText } from '../lib/speech'
import type { Progress } from '../lib/research'
import { ChatError, type Msg } from '../lib/types'
import { useAuth } from '../store/auth'
import { useRatings } from '../store/ratings'
import { useSettings } from '../store/settings'
import type { RunStatus } from '../store/chat'
import { useTheme, type Theme } from '../theme/theme'
import { Icon } from './Icons'
import { Markdown } from './Markdown'

const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
const PHASES = ['plan', 'search', 'read', 'check', 'write'] as const
const PHASE_KEY = { plan: 'researchPlan', search: 'researchSearch', read: 'researchRead', check: 'researchCheck', write: 'researchWrite' } as const

/** The same stamp the reference app prints next to a message: 2026-10-24 14:30:07. */
export function stamp(ts: number): string {
  const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
/** Seconds with one decimal, comma for Indonesian (5,2 dtk). */
export function secondsLabel(ms: number, lang: Lang): string {
  const s = (Math.max(0, ms) / 1000).toFixed(1)
  return lang === 'id' ? s.replace('.', ',') : s
}
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

function Avatar({ children, th, testID }: { children: React.ReactNode; th: Theme; testID?: string }) {
  return <View testID={testID} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: th.surface3, overflow: 'hidden' }}>{children}</View>
}

/** Live progress of a Deep research run: finished steps ticked, the current one with what it is doing. */
export function ResearchCard({ p }: { p: Progress }) {
  const th = useTheme(), t = useT(), at = PHASES.indexOf(p.phase)
  const detail = p.detail ? (p.phase === 'read' ? domain(p.detail) : p.detail) : ''
  return (
    <View testID="research-card" style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 12, backgroundColor: th.surface, padding: 12, gap: 6, alignSelf: 'flex-start', maxWidth: '100%' }}>
      {PHASES.map((ph, i) => (
        <View key={ph} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 16, alignItems: 'center' }}>{i < at ? <Icon name="Check" size={14} color={th.accentStrong} /> : i === at ? <ActivityIndicator size="small" color={th.accent} /> : <Text style={{ color: th.muted2 }}>·</Text>}</View>
          <Text style={{ color: i === at ? th.ink : i < at ? th.muted : th.muted2, fontWeight: i === at ? '600' : '400', fontSize: 14 }}>{t(PHASE_KEY[ph])}</Text>
          {i === at && p.total > 1 && <Text style={{ color: th.muted, fontSize: 12 }}>{Math.min(p.done + (p.phase === 'search' || p.phase === 'read' ? 1 : 0), p.total)}/{p.total}</Text>}
          {i === at && !!detail && <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12, flexShrink: 1 }}>{detail}</Text>}
        </View>))}
    </View>
  )
}

export function errorLine(code: string, lang: Lang, t: ReturnType<typeof useT>): string {
  if (code.startsWith('research:')) return t(({ limit: 'researchErrLimit', search: 'researchErrSearch', nosources: 'researchErrNone' } as const)[code.slice(9) as 'limit'] ?? 'researchErrSearch')
  const [k, s] = code.split(':')
  return errorText(lang, new ChatError(k as ChatError['kind'], { retryAfterSeconds: s ? Number(s) : undefined }))
}

/** Name + time above a message, with the user's avatar on the right and the answer's mark on the left. */
function Meta({ msg, th, user }: { msg: Msg; th: Theme; user: boolean }) {
  const t = useT(), account = useAuth(s => s.account)
  const who = user ? (account?.display_name?.trim() || account?.email?.split('@')[0] || t('you')) : (msg.model || t('assistant'))
  return (
    <View testID={user ? 'meta-user' : 'meta-assistant'} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: user ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      {user && <View style={{ alignItems: 'flex-end', flexShrink: 1 }}><Text numberOfLines={1} style={{ color: th.muted, fontSize: 13, fontWeight: '500' }}>{who}</Text><Text testID="msg-time" style={{ color: th.muted2, fontSize: 11, marginTop: 2 }}>{stamp(msg.createdAt)}</Text></View>}
      {user
        ? <Avatar th={th} testID="avatar-user"><Text style={{ color: th.accentStrong, fontSize: 13, fontWeight: '700' }}>{initialOf(who)}</Text></Avatar>
        : <Avatar th={th} testID="avatar-assistant"><Image source={require('../../assets/bico/bico-mark.png')} style={{ width: 22, height: 22 }} resizeMode="contain" accessibilityIgnoresInvertColors /></Avatar>}
      {!user && <View style={{ flexShrink: 1 }}><Text testID="assistant-name" numberOfLines={1} style={{ color: th.muted, fontSize: 13, fontWeight: '500' }}>{who}</Text><Text testID="msg-time" style={{ color: th.muted2, fontSize: 11, marginTop: 2 }}>{stamp(msg.createdAt)}</Text></View>}
    </View>
  )
}

/** Reasoning is collapsed to one line once the answer starts, with how long the model thought. */
function ReasoningCard({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang)
  const [open, setOpen] = useState(false), [now, setNow] = useState(() => Date.now())
  const live = streaming && !msg.content && !msg.reasoningMs
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [live])
  const ms = msg.reasoningMs ?? (msg.reasoningAt ? Math.max(0, now - msg.reasoningAt) : 0)
  const text = live ? t('thinkingLive', { t: secondsLabel(ms, lang) }) : ms ? t('thoughtDone', { t: secondsLabel(ms, lang) }) : t('thought')
  const expanded = open || live
  return (
    <Pressable testID="reasoning-toggle" onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={text}
      style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: th.lineStrong, borderRadius: 12, padding: 10, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text testID="reasoning-label" style={{ color: th.muted, fontWeight: '600', fontSize: 13, flexShrink: 1 }}>{text}</Text>
        <Icon name={expanded ? 'ChevL' : 'ChevR'} size={14} color={th.muted2} />
      </View>
      {expanded && <Text style={{ color: th.muted, fontSize: 13, marginTop: 6 }}>{msg.reasoning}</Text>}
    </Pressable>
  )
}

interface Props { msg: Msg; streaming: boolean; status: RunStatus | null; isLastAssistant: boolean; canAct: boolean; onRegenerate: () => void; onReport?: () => void }

function MessageViewBase({ msg, streaming, status, isLastAssistant, canAct, onRegenerate, onReport }: Props) {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang), meta = useSettings(s => s.msgMeta)
  const [speaking, setSpeaking] = useState(false), [copied, setCopied] = useState(false)
  const liked = useRatings(r => !!r.up[msg.id]), disliked = useRatings(r => !!r.down[msg.id])
  useEffect(() => () => { if (speaking) void Speech.stop() }, [speaking])
  if (msg.role === 'user') return (
    <View style={{ alignItems: 'flex-end', marginVertical: 12, paddingHorizontal: 16 }} accessibilityLabel={t('you')}>
      {meta && <Meta msg={msg} th={th} user />}
      <View style={{ maxWidth: '75%', backgroundColor: th.accentSoft, borderWidth: 1, borderColor: th.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 }}>
        {!!msg.attachments?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: msg.content ? 8 : 0 }}>
            {msg.attachments.map((a, i) => a.kind === 'image' && a.dataUrl
              ? <Image key={i} source={{ uri: a.dataUrl }} style={{ width: 96, height: 96, borderRadius: 10 }} accessibilityIgnoresInvertColors accessibilityLabel={a.name} />
              : <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: th.surface, borderWidth: 1, borderColor: th.line, maxWidth: 220 }}><Icon name="Check" size={14} color={th.accentStrong} /><Text numberOfLines={1} style={{ color: th.ink, fontSize: 13, flexShrink: 1 }}>{a.name}</Text></View>)}
          </View>)}
        {!!(msg.shown ?? msg.content) && <Text selectable style={{ color: th.ink, fontSize: 16.5, lineHeight: 24 }}>{msg.shown ?? msg.content}</Text>}
      </View>
    </View>
  )
  const speak = () => {
    if (speaking) { void Speech.stop(); setSpeaking(false); return }
    const text = plainText(msg.content); if (!text) return
    setSpeaking(true)
    Speech.speak(text, { language: bcp47(lang), onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) })
  }
  const copy = async () => { await Clipboard.setStringAsync(msg.content || msg.image?.prompt || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const showTyping = streaming && !msg.content && !status && !msg.reasoning
  return (
    <View style={{ marginVertical: 12, paddingHorizontal: 20 }} accessibilityLabel={t('assistant')}>
      {meta && <Meta msg={msg} th={th} user={false} />}
      {!!msg.reasoning && <ReasoningCard msg={msg} streaming={streaming} />}
      {status?.research && <View style={{ marginBottom: 8 }}><ResearchCard p={status.research} /></View>}
      {!!status && !status.research && (status.searching || status.reading) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: th.surface3, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 8, maxWidth: '100%' }}>
          <ActivityIndicator size="small" color={th.accent} />
          <Text numberOfLines={1} style={{ color: th.muted, fontSize: 13, flexShrink: 1 }}>{status.searching ? t('searching', { q: status.searching }) : t('reading', { u: domain(status.reading ?? '') })}</Text>
        </View>)}
      {msg.research && !streaming && <Text style={{ color: th.muted, fontSize: 12, marginBottom: 6 }}>{t('researchLog', { s: msg.research.searches, p: msg.research.pages })}</Text>}
      {showTyping ? <ActivityIndicator color={th.muted2} style={{ alignSelf: 'flex-start', marginVertical: 8 }} /> : !!msg.content && <Markdown text={msg.content} sources={msg.sources} streaming={streaming} />}
      {(msg.attachments ?? []).filter(a => a.kind === 'image' && a.uri && imageUri(a.uri)).map(a => (
        <Pressable key={a.uri} testID="generated-image" accessibilityRole="imagebutton" accessibilityLabel={msg.image?.prompt || t('imgAlt')} onPress={() => void Share.share({ url: imageUri(a.uri!) })} style={{ marginTop: 4, alignSelf: 'flex-start', width: '100%', maxWidth: 420, aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: th.surface3 }}>
          <Image source={{ uri: imageUri(a.uri!) }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Pressable>))}
      {!!msg.error && <Text accessibilityRole="alert" style={{ color: th.danger, fontSize: 14, marginTop: 6 }}>{errorLine(msg.error, lang, t)}</Text>}
      {!!msg.sources?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Text style={{ color: th.muted, fontSize: 12.5 }}>{t('sources')}</Text>
          {msg.sources.map((s, i) => /^https?:\/\//i.test(s.url) ? (
            <Pressable key={s.url} accessibilityRole="link" onPress={() => void Linking.openURL(s.url).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: th.accentStrong, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text></View>
              <Text style={{ color: th.ink, fontSize: 12.5 }}>{domain(s.url)}</Text>
            </Pressable>) : null)}
        </View>)}
      {!streaming && (!!msg.content || !!msg.attachments?.length) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Pressable onPress={copy} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('copy')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 }}><Icon name={copied ? 'Check' : 'Copy'} size={16} color={th.muted} /><Text style={{ color: th.muted, fontSize: 12.5 }}>{copied ? t('copied') : t('copy')}</Text></Pressable>
          {!!msg.content && <Pressable onPress={speak} hitSlop={8} accessibilityRole="button" accessibilityLabel={t(speaking ? 'stopReading' : 'readAloud')} testID="read-aloud" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 }}><Icon name={speaking ? 'Stop' : 'Speaker'} size={16} color={th.muted} /></Pressable>}
          <Pressable onPress={() => void Share.share({ message: msg.content + (msg.sources?.length ? '\n\n' + msg.sources.map((s, i) => `${i + 1}. ${s.title} ${s.url}`).join('\n') : '') })} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('share')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 }}><Icon name="Share" size={16} color={th.muted} /><Text style={{ color: th.muted, fontSize: 12.5 }}>{t('share')}</Text></Pressable>
          {isLastAssistant && canAct && <Pressable onPress={onRegenerate} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('regenerate')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 }}><Icon name="Refresh" size={16} color={th.muted} /><Text style={{ color: th.muted, fontSize: 12.5 }}>{t('regenerate')}</Text></Pressable>}
          <Pressable testID="rate-up" onPress={() => useRatings.getState().toggleUp(msg.id)} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={t('rateUp')} style={{ padding: 6 }}><Icon name="ThumbUp" size={16} color={liked ? th.accentStrong : th.muted} strokeWidth={liked ? 2.5 : 1.8} /></Pressable>
          {!!onReport && <Pressable testID="report-open" onPress={onReport} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: disliked }} accessibilityLabel={t('rpOpen')} style={{ padding: 6 }}><Icon name="ThumbDown" size={16} color={disliked ? th.danger : th.muted} strokeWidth={disliked ? 2.5 : 1.8} /></Pressable>}
          {!!msg.ms && <Text testID="msg-latency" style={{ color: th.muted2, fontSize: 12, marginLeft: 4 }}>{t('latency', { t: secondsLabel(msg.ms, lang) })}</Text>}
        </View>)}
      {!streaming && !msg.content && !!msg.error && isLastAssistant && canAct && (
        <Pressable onPress={onRegenerate} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6, marginTop: 4 }}><Icon name="Refresh" size={16} color={th.muted} /><Text style={{ color: th.muted, fontSize: 13 }}>{t('regenerate')}</Text></Pressable>)}
    </View>
  )
}
export const MessageView = memo(MessageViewBase)
