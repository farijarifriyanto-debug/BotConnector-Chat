import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, Modal, Pressable, ScrollView, Share, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, TextInput } from './Text'
import { Icon } from './Icons'
import { ModelIcon } from './ModelIcon'
import { errorLine } from './MessageView'
import { useT } from '../hooks/useT'
import { imageUri } from '../lib/images'
import { MAX_IMAGES, pickPhotos, type LocalAttachment } from '../lib/attachments'
import { aspectOptions, defaultSize, imageAsModel } from '../lib/modelPicker'
import type { Msg } from '../lib/types'
import { useSettings } from '../store/settings'
import { currentConv, useChat } from '../store/chat'
import { useTheme } from '../theme/theme'

interface Shot { convId: string; msg: Msg; uri: string }
const ratioOf = (size?: string) => { const m = /^(\d+)x(\d+)$/.exec(size ?? ''); return m ? +m[1] / +m[2] : 1 }

/** The pictures made so far, newest first. They live in the chats (one history), so the Studio only reads them. */
export function recentShots(convs: { id: string; messages: Msg[] }[], limit = 24): Shot[] {
  const out: Shot[] = []
  for (const c of convs) for (const m of c.messages) { const a = m.attachments?.find(x => x.kind === 'image' && x.uri && imageUri(x.uri)); if (m.role === 'assistant' && a?.uri && !m.error) out.push({ convId: c.id, msg: m, uri: a.uri }) }
  return out.sort((a, b) => b.msg.createdAt - a.msg.createdAt).slice(0, limit)
}

/** AI Image Studio: the same image pipeline as the chat's Image mode (same quota, same history) in a roomier screen. */
export function ImageStudio({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang)
  const imageModels = useChat(s => s.imageModels), imageModelId = useChat(s => s.imageModelId), convs = useChat(s => s.convs), busy = useChat(s => s.busy)
  const conv = useChat(currentConv)
  const model = imageModels.find(m => m.id === imageModelId) ?? imageModels[0]
  const [prompt, setPrompt] = useState(''), [refs, setRefs] = useState<LocalAttachment[]>([]), [size, setSize] = useState<string | undefined>(undefined), [shownUri, setShownUri] = useState<string | null>(null), [full, setFull] = useState(false)
  const scroll = useRef<ScrollView>(null), resultY = useRef(0), sent = useRef(false)
  const ratios = useMemo(() => aspectOptions(model?.sizes ?? []), [model])
  useEffect(() => { setSize(defaultSize(model?.sizes ?? [])); if (!model?.refs) setRefs([]) }, [model?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const shots = useMemo(() => recentShots(convs), [convs])
  const last = conv?.messages.at(-1)
  const lastShot = last && last.role === 'assistant' ? shots.find(s => s.msg.id === last.id) : undefined
  const shown = shots.find(s => s.uri === shownUri) ?? lastShot ?? shots[0]
  const failed = !busy && !!last?.error && last.role === 'assistant' && !!last.image
  const canRegen = !busy && !!lastShot && shown?.msg.id === lastShot.msg.id
  // after a request finishes: show the result (the keyboard is already closed) and bring it into view
  useEffect(() => { if (sent.current && !busy) { sent.current = false; setShownUri(null); setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, resultY.current - 8), animated: true }), 80) } }, [busy])

  const ready = !!model && prompt.trim().length > 0 && !busy
  const create = () => {
    if (!ready) return
    Keyboard.dismiss(); sent.current = true
    const st = useChat.getState(); const c = currentConv(st); if (c && c.messages.length > 0 && !shownKeep(c.messages)) st.newChat()
    void useChat.getState().send(prompt.trim(), { web: false, research: false, image: true, size }, model?.refs ? refs.map(({ id: _id, sourceUri: _s, progress: _p, ...a }) => a) : [])
    setPrompt(''); setRefs([])
  }
  const addRef = async () => { const room = MAX_IMAGES - refs.length; if (room <= 0) return; const got = await pickPhotos(room); if (got.length) setRefs(r => [...r, ...got].slice(0, MAX_IMAGES)) }
  const editAgain = async (s: Shot) => {
    if (!model?.refs) return
    try {
      const b64 = await FileSystem.readAsStringAsync(imageUri(s.uri), { encoding: FileSystem.EncodingType.Base64 }), mime = /\.jpe?g$/.test(s.uri) ? 'image/jpeg' : /\.webp$/.test(s.uri) ? 'image/webp' : 'image/png'
      setRefs(r => [...r, { id: 'ref-' + Date.now(), kind: 'image' as const, name: 'image', mime, size: Math.round(b64.length * 0.75), dataUrl: `data:${mime};base64,${b64}` }].slice(-MAX_IMAGES))
      scroll.current?.scrollTo({ y: 0, animated: true })
    } catch { /* the file is gone: nothing to edit */ }
  }
  const share = async (s: Shot) => { const u = imageUri(s.uri); if (await Sharing.isAvailableAsync().catch(() => false)) await Sharing.shareAsync(u, { mimeType: s.msg.attachments?.[0]?.mime ?? 'image/png' }).catch(() => {}); else await Share.share({ url: u }).catch(() => {}) }

  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>{txt}</Text>
  const action = (testID: string, icon: 'Share' | 'Pencil' | 'Refresh', text: string, onPress: () => void, enabled = true) => (
    <Pressable testID={testID} disabled={!enabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ disabled: !enabled }} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, opacity: enabled ? 1 : 0.4, paddingHorizontal: 4 }}>
      <Icon name={icon} size={20} color={th.ink} /><Text numberOfLines={1} style={{ color: th.ink, fontSize: 12 }}>{text}</Text>
    </Pressable>)
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 20, fontWeight: '800' }}>{t('stTitle')}</Text>
            <Text style={{ color: th.muted, fontSize: 13 }}>{t('stSub')}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')} testID="studio-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {!model ? <Text testID="studio-nomodel" style={{ color: th.muted, marginTop: 24, textAlign: 'center' }}>{t('stNoModel')}</Text> : <>
            <View style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 16, backgroundColor: th.surface, padding: 12, marginTop: 6 }}>
              <TextInput testID="studio-prompt" value={prompt} onChangeText={setPrompt} multiline editable={!busy} placeholder={t('imgPlaceholder')} placeholderTextColor={th.muted2} accessibilityLabel={t('imgPlaceholder')} style={{ color: th.ink, fontSize: 16, lineHeight: 22, minHeight: 72, maxHeight: 180, textAlignVertical: 'top', paddingTop: 0 }} />
              {refs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
                  {refs.map(r => (
                    <View key={r.id} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: th.surface3 }}>
                      <Image source={{ uri: r.dataUrl }} style={{ width: 64, height: 64 }} resizeMethod="resize" accessibilityIgnoresInvertColors accessibilityLabel={t('stAddRef')} />
                      <Pressable testID={`ref-remove-${r.id}`} onPress={() => setRefs(l => l.filter(x => x.id !== r.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('remove')} style={{ position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 9, padding: 3 }}><Icon name="Close" size={11} color="#fff" /></Pressable>
                    </View>))}
                </ScrollView>)}
              {model.refs
                ? <Pressable testID="studio-add-ref" onPress={() => void addRef()} disabled={busy || refs.length >= MAX_IMAGES} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong, opacity: refs.length >= MAX_IMAGES ? 0.4 : 1 }}><Icon name="Image" size={16} color={th.muted} /><Text style={{ color: th.ink, fontSize: 13 }}>{t('stAddRef')}</Text></Pressable>
                : <Text testID="studio-ref-none" style={{ color: th.muted2, fontSize: 12, marginTop: 8 }}>{t('stRefNone')}</Text>}
              {model.refs && refs.length > 0 && <Text style={{ color: th.muted, fontSize: 12, marginTop: 8 }}>{t('stRefHint')}</Text>}
            </View>

            {label(t('stModel'))}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {imageModels.map(m => { const on = m.id === model.id; return (
                <Pressable key={m.id} testID={`studio-model-${m.id}`} disabled={busy} onPress={() => useChat.getState().selectImageModel(m.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${m.name}, ${t(m.access === 'free' ? 'accFree' : m.access === 'plan' ? 'accPlan' : m.access === 'family' ? 'accFamily' : 'accPayg')}`}
                  style={{ width: 124, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? th.accent : th.line, backgroundColor: th.surface, overflow: 'hidden' }}>
                  <View style={{ height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.accentSoft : th.surface3 }}><ModelIcon model={imageAsModel(m)} size={40} />{on && <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: th.accent, borderRadius: 10, padding: 3 }}><Icon name="Check" size={12} color={th.accentInk} /></View>}</View>
                  <View style={{ padding: 8, gap: 4 }}>
                    <Text numberOfLines={2} style={{ color: th.ink, fontSize: 13, fontWeight: '600', minHeight: 34 }}>{m.name}</Text>
                    <Text style={{ color: m.access === 'free' ? th.free : m.access === 'payg' ? th.payg : th.plan, fontSize: 11, fontWeight: '700' }}>{t(m.access === 'free' ? 'accFree' : m.access === 'plan' ? 'accPlan' : m.access === 'family' ? 'accFamily' : 'accPayg')}{m.refs ? ` · ${t('imgRefBadge')}` : ''}</Text>
                  </View>
                </Pressable>) })}
            </ScrollView>

            {ratios.length > 1 && <>
              {label(t('stRatio'))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ratios.map(r => { const on = r.size === size; return (
                  <Pressable key={r.size} testID={`ratio-${r.size}`} disabled={busy} onPress={() => setSize(r.size)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={r.size === 'auto' ? t('stAuto') : r.label} style={{ minWidth: 64, height: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface }}>
                    <Text style={{ color: on ? th.accentStrong : th.ink, fontWeight: '600', fontSize: 14 }}>{r.size === 'auto' ? t('stAuto') : r.label}</Text>
                  </Pressable>) })}
              </View>
            </>}

            <Pressable testID="studio-create" onPress={create} disabled={!ready} accessibilityRole="button" accessibilityLabel={busy ? t('stCreating') : t('stCreate')} accessibilityState={{ disabled: !ready, busy }} style={{ marginTop: 20, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, backgroundColor: ready || busy ? th.accent : th.surface3 }}>
              {busy ? <><ActivityIndicator color={th.accentInk} /><Text style={{ color: th.accentInk, fontWeight: '700', fontSize: 16 }}>{t('stCreating')}</Text></> : <Text style={{ color: ready ? th.accentInk : th.muted2, fontWeight: '700', fontSize: 16 }}>{t('stCreate')}</Text>}
            </Pressable>
            {busy && <Pressable testID="studio-cancel" onPress={() => useChat.getState().stop()} accessibilityRole="button" style={{ alignSelf: 'center', padding: 10 }}><Text style={{ color: th.muted, fontWeight: '600' }}>{t('stCancel')}</Text></Pressable>}
            <Text style={{ color: th.muted2, fontSize: 12, textAlign: 'center', marginTop: busy ? 0 : 8 }}>{t('stOne')}</Text>
            {failed && (
              <View accessibilityRole="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: th.dangerSoft }}>
                <Text style={{ color: th.danger, fontSize: 14 }}>{last?.error ? errorLine(last.error, lang, t) : t('stFail')}</Text>
                <Pressable testID="studio-retry" onPress={() => { sent.current = true; void useChat.getState().regenerate({ web: false, research: false }) }} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 6 }}><Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('retry')}</Text></Pressable>
              </View>)}

            <View onLayout={e => { resultY.current = e.nativeEvent.layout.y }}>
              {shown && <>
                {label(t('stResult'))}
                <Pressable testID="studio-result" onPress={() => setFull(true)} accessibilityRole="imagebutton" accessibilityLabel={shown.msg.image?.prompt || t('imgAlt')} style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: th.surface3, aspectRatio: ratioOf(shown.msg.image?.size), width: '100%' }}>
                  <Image source={{ uri: imageUri(shown.uri) }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors />
                </Pressable>
                {!!shown.msg.image?.prompt && <Text numberOfLines={3} style={{ color: th.muted, fontSize: 13, marginTop: 8 }}>{shown.msg.image.prompt}</Text>}
                <Text style={{ color: th.muted2, fontSize: 12, marginTop: 2 }}>{[shown.msg.image?.model, shown.msg.image?.size].filter(Boolean).join(' · ')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {action('studio-share', 'Share', t('stShare'), () => void share(shown))}
                  {action('studio-edit', 'Pencil', t('stEdit'), () => void editAgain(shown), !!model.refs && !busy)}
                  {action('studio-regen', 'Refresh', t('stRegen'), () => { sent.current = true; void useChat.getState().regenerate({ web: false, research: false }) }, canRegen)}
                </View>
                {canRegen && <Text style={{ color: th.muted2, fontSize: 12, marginTop: 6 }}>{t('stRegenNote')}</Text>}
                {!model.refs && <Text style={{ color: th.muted2, fontSize: 12, marginTop: 6 }}>{t('stRefNone')}</Text>}
              </>}
              {label(t('stRecent'))}
              {shots.length === 0 && <Text testID="studio-empty" style={{ color: th.muted }}>{t('stNoImages')}</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {shots.map(s => (
                  <Pressable key={s.msg.id} testID={`shot-${s.msg.id}`} onPress={() => { setShownUri(s.uri); scroll.current?.scrollTo({ y: Math.max(0, resultY.current - 8), animated: true }) }} accessibilityRole="imagebutton" accessibilityLabel={s.msg.image?.prompt || t('imgAlt')} accessibilityState={{ selected: s.uri === shown?.uri }} style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', borderWidth: s.uri === shown?.uri ? 2 : 0, borderColor: th.accent, backgroundColor: th.surface3 }}>
                    <Image source={{ uri: imageUri(s.uri) }} style={{ width: '100%', height: '100%' }} resizeMethod="resize" accessibilityIgnoresInvertColors />
                  </Pressable>))}
              </View>
            </View>
          </>}
        </ScrollView>
        <Modal visible={full && !!shown} animationType="fade" onRequestClose={() => setFull(false)} transparent={false}>
          <Pressable testID="studio-full" onPress={() => setFull(false)} accessibilityRole="button" accessibilityLabel={t('close')} style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
            {!!shown && <Image source={{ uri: imageUri(shown.uri) }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors />}
          </Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  )
}
/** A chat that is only pictures (made in the Studio) can take the next one; anything else gets a fresh chat. */
const shownKeep = (msgs: Msg[]) => msgs.every(m => m.role === 'user' || !!m.image)
