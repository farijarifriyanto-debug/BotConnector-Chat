import React, { useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio'
import { Text, TextInput } from './Text'
import { useAttachments } from '../hooks/useAttachments'
import { useT } from '../hooks/useT'
import { MAX_IMAGES } from '../lib/attachments'
import { insertPhrase } from '../lib/phrases'
import type { Attachment, ChatModel } from '../lib/types'
import { joinVoiceText } from '../lib/voice'
import { openAsrStream, type AsrSession } from '../lib/asrStream'
import { useAuth } from '../store/auth'
import { usePhrases } from '../store/phrases'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { ModelIcon } from './ModelIcon'
import { QuickPhrasesSheet } from './QuickPhrasesSheet'

export interface SendFlags { web: boolean; research: boolean; image: boolean; think?: boolean }
interface Props {
  busy: boolean; model: ChatModel | undefined; webAvailable: boolean; onSend: (text: string, o: SendFlags, attachments: Attachment[]) => void; onStop: () => void
  /** one picture per message; shown only when the account has image models */
  image?: { available: boolean; modelName: string; onPick: () => void }
  /** photos and documents (documents need a plan or balance: the server says so) */
  files?: { available: boolean }
  /** Deep research reads pages through BotConnector, so it needs an account */
  researchAvailable?: boolean
  /** the model button in the action row opens the model list, like the reference app's composer */
  onPickModel?: () => void
  /** shown when web search is not available yet: tapping it leads to the search settings instead of doing nothing */
  onWebUnavailable?: () => void
  /** reasoning on/off for models that can think */
  think?: boolean
  onThinkChange?: (on: boolean) => void
  /** what is waiting for the answer to finish */
  queued?: { text: string } | null
  onQueue?: (text: string, o: SendFlags, attachments: Attachment[]) => void
  onCancelQueue?: () => void
  /** voice input: recorded on the phone, transcribed by BotConnector */
  voice?: { available: boolean }
}

/**
 * Message box: the reference app's action row — model mark, attach, the switched-on features as
 * icon buttons, and whatever no longer fits collected under "+". Send becomes stop while an
 * answer streams, and a message typed in the meantime waits its turn instead of disappearing.
 */
export function Composer({ busy, model, webAvailable, onSend, onStop, image, files, researchAvailable = true, onPickModel, onWebUnavailable, think = true, onThinkChange, queued, onQueue, onCancelQueue, voice }: Props) {
  const th = useTheme(), t = useT(), att = useAttachments(), lang = useSettings(s => s.lang), phrases = usePhrases(s => s.phrases)
  const [text, setText] = useState(''), [web, setWeb] = useState(false), [research, setResearch] = useState(false), [img, setImg] = useState(false), [note, setNote] = useState<string | null>(null)
  const [rowW, setRowW] = useState(0), [more, setMore] = useState(false), [quick, setQuick] = useState(false), [manage, setManage] = useState(false)
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null)
  const audio = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer: buffer => { session.current?.send(new Uint8Array(buffer.data)) } })
  const session = useRef<AsrSession | null>(null)
  const baseText = useRef(''), voiceFailed = useRef(false), finalWait = useRef<{ resolve: (text: string | null) => void } | null>(null)
  const [recording, setRecording] = useState(false), [transcribing, setTranscribing] = useState(false), [recordedMs, setRecordedMs] = useState(0)
  const hasPhotos = att.photoCount > 0
  const blocked = !img && (!att.ready || (hasPhotos && !model?.vision))
  const flags: SendFlags = { web: web || research, research, image: img, think }
  const can = !busy && (!!model || img) && text.trim().length > 0 && !blocked
  const canQueue = busy && !!onQueue && text.trim().length > 0 && !blocked
  const submit = () => {
    if (!can) return
    onSend(text, flags, img ? [] : att.toMessage())
    setText(''); setSel(null); setResearch(false); setImg(false); setNote(null); att.clear()   // Deep research and Image are for one message, like the web
  }
  const queueOrSend = () => {
    if (canQueue) {
      onQueue!(text, flags, img ? [] : att.toMessage())
      setText(''); setResearch(false); setImg(false); setNote(null); att.clear()
      return
    }
    submit()
  }
  const openAttach = () => {
    setNote(null)
    const options: { text: string; action: () => void }[] = []
    if (att.photoCount < MAX_IMAGES) {
      options.push({ text: t('attachPhoto'), action: () => { void att.addPhotos() } })
      options.push({ text: t('attachCamera'), action: () => { void att.addCamera().then(r => { if (r === 'denied') setNote(t('camDenied')) }) } })
    }
    if (files?.available) {
      options.push({ text: t('attachFile'), action: () => { void att.addDocument(false) } })
      // Explicit user action also constitutes consent for nonsensitive cloud processing.
      // Default remains local; the backend independently enforces the cloud limit.
      options.push({ text: t('attachFileCloud'), action: () => { void att.addDocument(true) } })
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        options: [...options.map(x => x.text), t('cancel')],
        cancelButtonIndex: options.length
      }, i => { if (i >= 0 && i < options.length) options[i].action() })
    } else {
      Alert.alert(t('attach'), undefined, [
        ...options.map(x => ({ text: x.text, onPress: x.action })),
        { text: t('cancel'), style: 'cancel' as const }
      ])
    }
  }
  // The recording clock, like the live hint the reference app shows while the microphone is open.
  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    setRecordedMs(0)
    const id = setInterval(() => setRecordedMs(Date.now() - started), 250)
    return () => clearInterval(id)
  }, [recording])

  const startVoice = async () => {
    if (!voice?.available || recording || transcribing || busy) return
    setNote(null); voiceFailed.current = false
    const token = useAuth.getState().session?.accessToken
    if (!token) { setNote(t('micDenied')); return }
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) { setNote(t('micDenied')); return }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })
      await audio.stream.start()
      baseText.current = text
      session.current = openAsrStream({
        token, sampleRate: audio.stream.sampleRate || 16000, language: /^[a-z]{2,3}$/.test(lang) ? lang : undefined,
        handlers: {
          onPartial: partial => setText(joinVoiceText(baseText.current, partial)),
          onFinal: final => { setText(joinVoiceText(baseText.current, final)); finalWait.current?.resolve(final) },
          onError: () => { voiceFailed.current = true; setNote(t('micFail')); finalWait.current?.resolve(null) },
          onClose: () => finalWait.current?.resolve(null),
        },
      })
      setRecording(true)
    } catch { setNote(t('micFail')) }
  }

  /** Ends the stream, waits for the final words, and puts them after the draft (or sends them). */
  const finishVoice = async (sendAfter: boolean) => {
    if (!recording || transcribing) return
    setRecording(false); setTranscribing(true)
    const done = new Promise<string | null>(resolve => {
      const timer = setTimeout(() => resolve(null), 8000)
      finalWait.current = { resolve: text => { clearTimeout(timer); resolve(text) } }
    })
    try { session.current?.finish(); session.current = null } catch { /* the socket may already be closed */ }
    try { audio.stream.stop() } catch { /* already stopped */ }
    const final = await Promise.race([done, new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))])
    finalWait.current = null
    setTranscribing(false)
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    if (final === null) { if (!voiceFailed.current) setNote(t('micFail')); return }
    if (!final.trim()) { setNote(t('micNoSpeech')); return }
    const next = joinVoiceText(baseText.current, final)
    setText(next); setSel({ start: next.length, end: next.length })
    if (sendAfter) {
      onSend(next, flags, img ? [] : att.toMessage())
      setText(''); setSel(null); setResearch(false); setImg(false); setNote(null); att.clear()
    }
  }

  const cancelVoice = async () => {
    if (!recording) return
    setRecording(false)
    try { session.current?.cancel(); session.current = null } catch { /* already closed */ }
    try { audio.stream.stop() } catch { /* already stopped */ }
    setText(baseText.current); setSel(null)
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {})
  }

  const pill = (on: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface })
  /** The reference app's composer is a translucent, hairline-bordered box of radius 20 over a blur we cannot do in RN without a native module. */
  const boxFill = th.dark ? 'rgba(23,27,33,0.80)' : 'rgba(255,255,255,0.86)'
  const boxLine = th.dark ? 'rgba(243,246,244,0.10)' : 'rgba(134,147,141,0.35)'
  const offFill = th.dark ? 'rgba(243,246,244,0.12)' : 'rgba(15,26,21,0.12)'
  const warn = hasPhotos && !model?.vision ? t('attachNeedsModel') : !att.ready && !att.hasFailed ? t('fileWait') : note

  // What fits next to the model button, attach and send; the rest waits under "+".
  const actions = [
    ...(!webAvailable && onWebUnavailable ? [{ id: 'web' as const, label: t('web'), icon: 'Globe' as const, on: false, toggle: onWebUnavailable }] : []),
    ...(webAvailable ? [{ id: 'web' as const, label: t('web'), icon: 'Globe' as const, on: web, toggle: () => setWeb(v => !v) }] : []),
    ...(webAvailable && researchAvailable ? [{ id: 'research' as const, label: t('researchPill'), icon: 'Research' as const, on: research, toggle: () => { setResearch(v => !v); setImg(false) } }] : []),
    ...(image?.available ? [{ id: 'image' as const, label: t('imgPill'), icon: 'Image' as const, on: img, toggle: () => { setImg(v => !v); setResearch(false) } }] : []),
    ...(model?.reasoning && onThinkChange ? [{ id: 'think' as const, label: t('thinkPill'), icon: 'Brain' as const, on: think, toggle: () => onThinkChange(!think) }] : []),
  ]
  const budget = rowW - (30 + 32 + 34) - 8 * 3
  const slots = rowW ? Math.floor(budget / 40) : actions.length
  const shownCount = slots >= actions.length ? actions.length : Math.max(0, slots - 1)
  const hidden = actions.slice(shownCount)

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: th.bg, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {img && <Pressable onPress={image?.onPick} accessibilityRole="button"><Text style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('imgOneShot')} — {t('imgModelRow', { m: image?.modelName ?? '' })} ↗</Text></Pressable>}
      {research && <Text accessibilityRole="text" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('researchNote')}</Text>}
      {!!warn && !img && <Text accessibilityRole="alert" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{warn}</Text>}
      {transcribing && <Text testID="voice-transcribing" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('micTranscribing')}</Text>}
      {!!queued && (
        <View testID="composer-queued" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: 'center', backgroundColor: th.surface3, maxWidth: '100%' }}>
          <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12, flexShrink: 1 }}>{t('queuedNote', { s: queued.text.slice(0, 40) })}</Text>
          <Pressable testID="queued-cancel" onPress={onCancelQueue} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('cancel')}><Icon name="Close" size={14} color={th.muted} /></Pressable>
        </View>
      )}
      <View style={{ borderWidth: 1, borderColor: boxLine, borderRadius: 20, backgroundColor: boxFill, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
        {att.items.length > 0 && !img && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {att.items.map(a => (
              <View key={a.id} testID={`att-${a.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: a.kind === 'image' ? 0 : 10, paddingRight: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: a.status === 'failed' ? th.danger : th.line, backgroundColor: th.surface2, overflow: 'hidden', maxWidth: 220 }}>
                {a.kind === 'image' && !!a.dataUrl && <Image source={{ uri: a.dataUrl }} style={{ width: 44, height: 44 }} accessibilityIgnoresInvertColors />}
                {a.kind === 'file' && (a.status === 'ready' ? <Icon name="Check" size={16} color={th.accentStrong} /> : a.status === 'failed' ? <Icon name="Close" size={16} color={th.danger} /> : <ActivityIndicator size="small" color={th.muted} />)}
                {a.kind === 'file' && <View style={{ flexShrink: 1 }}><Text numberOfLines={1} style={{ color: th.ink, fontSize: 13, fontWeight: '600' }}>{a.name}</Text><Text style={{ color: a.status === 'failed' ? th.danger : th.muted, fontSize: 11 }}>{a.status === 'failed' ? t('fileFailed') : a.status === 'ready' ? '' : a.status === 'uploading' ? `${t('fileUploading')} ${Math.round((a.progress ?? 0) * 100)}%` : t('fileProcessing')}</Text></View>}
                <Pressable onPress={() => att.remove(a.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('remove')} testID={`att-remove-${a.name}`} style={a.kind === 'image' ? { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 9, padding: 2 } : undefined}><Icon name="Close" size={a.kind === 'image' ? 12 : 16} color={a.kind === 'image' ? '#fff' : th.muted} /></Pressable>
              </View>))}
          </ScrollView>)}
        <TextInput testID="composer-input" value={text} onChangeText={setText} multiline submitBehavior="submit" returnKeyType="send" onSubmitEditing={queueOrSend} placeholder={t(img ? 'imgPlaceholder' : research ? 'researchPlaceholder' : hasPhotos ? 'placeholderFile' : 'placeholder')} placeholderTextColor={th.muted2}
          onSelectionChange={e => setSel(e.nativeEvent.selection)}
          style={{ color: th.ink, fontSize: 16, lineHeight: 22, maxHeight: 150, minHeight: 24, paddingTop: 0, paddingBottom: 6 }} />
        <View testID="composer-actions" onLayout={e => setRowW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!recording && !!onPickModel && <Pressable testID="pill-model" accessibilityRole="button" accessibilityLabel={model ? `${t('menuModel')}: ${model.name}` : t('menuModel')} onPress={onPickModel} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{model ? <ModelIcon model={model} size={24} /> : <Icon name="Boxes" size={18} color={th.muted} />}</Pressable>}
          {!recording && !img && <Pressable testID="pill-attach" accessibilityRole="button" accessibilityLabel={t('attach')} onPress={openAttach} style={pill(false)}><Icon name="Plus" size={18} color={th.muted} /></Pressable>}
          {!recording && actions.slice(0, shownCount).map(a => (
            <Pressable key={a.id} testID={`pill-${a.id}`} accessibilityRole="button" accessibilityLabel={a.label} accessibilityState={{ selected: a.on }} onPress={a.toggle} style={pill(a.on)}>
              <Icon name={a.icon} size={18} color={a.on ? th.accentStrong : th.muted} />
            </Pressable>))}
          {!recording && hidden.length > 0 && (
            <Pressable testID="pill-more" accessibilityRole="button" accessibilityLabel={t('moreActions')} onPress={() => setMore(true)} style={pill(false)}><Icon name="Chevron" size={18} color={th.muted} /></Pressable>)}
          {recording && (
            <>
              <Pressable testID="voice-cancel" accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={() => void cancelVoice()} style={pill(false)}><Icon name="Close" size={18} color={th.muted} /></Pressable>
              <View testID="voice-recording" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: th.danger }} />
                <Text numberOfLines={1} style={{ color: th.muted, fontSize: 13, flexShrink: 1 }}>{t('micStop')} · {Math.floor(recordedMs / 1000)}s</Text>
              </View>
              <Pressable testID="voice-stop" accessibilityRole="button" accessibilityLabel={t('micStop')} onPress={() => void finishVoice(false)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="Stop" size={15} color={th.accentInk} /></Pressable>
            </>
          )}
          <View style={{ flex: 1 }} />
          {!recording && phrases.length > 0 && !img && (
            <Pressable testID="pill-quick" accessibilityRole="button" accessibilityLabel={t('qpTooltip')} onPress={() => setQuick(true)} onLongPress={() => setManage(true)} style={pill(false)}>
              <Icon name="Zap" size={18} color={th.muted} />
            </Pressable>)}
          {!recording && voice?.available && !img && (
            <Pressable testID="pill-voice" accessibilityRole="button" accessibilityLabel={t('mic')} disabled={busy || transcribing} onPress={() => void startVoice()} style={[pill(false), { opacity: busy || transcribing ? 0.5 : 1 }]}>
              {transcribing ? <ActivityIndicator size="small" color={th.muted} /> : <Icon name="Mic" size={18} color={th.muted} />}
            </Pressable>)}
          {busy
            ? <Pressable testID="send-stop" accessibilityRole="button" accessibilityLabel={t('stop')} onPress={onStop} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="Stop" size={15} color={th.accentInk} /></Pressable>
            : <Pressable testID="send-go" accessibilityRole="button" accessibilityLabel={t('send')} accessibilityState={{ disabled: !can && !recording }} disabled={!can && !recording} onPress={recording ? () => void finishVoice(true) : submit} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: can || recording ? th.accent : offFill, alignItems: 'center', justifyContent: 'center' }}><Icon name="Send" size={18} color={can || recording ? th.accentInk : th.muted2} /></Pressable>}
        </View>
      </View>

      <Modal visible={more} transparent animationType="fade" onRequestClose={() => setMore(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setMore(false)} accessibilityLabel={t('close')}>
          <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 }}>{t('moreActions')}</Text>
            {hidden.map(a => (
              <Pressable key={a.id} testID={`more-${a.id}`} onPress={() => { a.toggle(); setMore(false) }} accessibilityRole="button" accessibilityState={{ selected: a.on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6 }}>
                <Icon name={a.icon} size={20} color={a.on ? th.accentStrong : th.muted} />
                <Text style={{ color: th.ink, fontSize: 15, flex: 1 }}>{a.label}</Text>
                {a.on && <Icon name="Check" size={18} color={th.accentStrong} />}
              </Pressable>))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={quick} transparent animationType="fade" onRequestClose={() => setQuick(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setQuick(false)} accessibilityLabel={t('close')}>
          <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 10, paddingHorizontal: 12, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 6 }}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('qpTooltip')}</Text>
              <Pressable testID="qp-manage" onPress={() => { setQuick(false); setManage(true) }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qpManage')}><Text style={{ color: th.accentStrong, fontWeight: '700', fontSize: 13 }}>{t('qpManage')}</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {phrases.map(p => (
                <Pressable key={p.id} testID={`qp-pick-${p.id}`} accessibilityRole="button" accessibilityLabel={p.title} onPress={() => { const r = insertPhrase(text, p.content, sel); setText(r.text); setSel({ start: r.caret, end: r.caret }); setQuick(false) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6 }}>
                  <Icon name="Zap" size={18} color={th.accentStrong} />
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{p.title}</Text><Text numberOfLines={1} style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{p.content}</Text></View>
                </Pressable>))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <QuickPhrasesSheet visible={manage} onClose={() => setManage(false)} />
    </View>
  )
}
