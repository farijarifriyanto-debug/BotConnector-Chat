import React, { useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useAttachments } from '../hooks/useAttachments'
import { useT } from '../hooks/useT'
import { MAX_IMAGES } from '../lib/attachments'
import type { Attachment, ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

export interface SendFlags { web: boolean; research: boolean; image: boolean }
interface Props {
  busy: boolean; model: ChatModel | undefined; webAvailable: boolean; onSend: (text: string, o: SendFlags, attachments: Attachment[]) => void; onStop: () => void
  /** one picture per message; shown only when the account has image models */
  image?: { available: boolean; modelName: string; onPick: () => void }
  /** photos and documents (documents need a plan or balance: the server says so) */
  files?: { available: boolean }
  /** Deep research reads pages through BotConnector, so it needs an account */
  researchAvailable?: boolean
}

/** Message box: attach, Web search, Deep research (one answer), Image (one picture). Inactive pills are icons only so the row always fits. */
export function Composer({ busy, model, webAvailable, onSend, onStop, image, files, researchAvailable = true }: Props) {
  const th = useTheme(), t = useT(), att = useAttachments()
  const [text, setText] = useState(''), [web, setWeb] = useState(false), [research, setResearch] = useState(false), [img, setImg] = useState(false), [note, setNote] = useState<string | null>(null)
  const hasPhotos = att.photoCount > 0
  const blocked = !img && (!att.ready || (hasPhotos && !model?.vision))
  const can = !busy && (!!model || img) && text.trim().length > 0 && !blocked
  const submit = () => {
    if (!can) return
    onSend(text, { web: web || research, research, image: img }, img ? [] : att.toMessage())
    setText(''); setResearch(false); setImg(false); setNote(null); att.clear()   // Deep research and Image are for one message, like the web
  }
  const openAttach = () => {
    setNote(null)
    const run = (i: number) => { if (i === 0) void att.addPhotos(); else if (i === 1) void att.addCamera().then(r => { if (r === 'denied') setNote(t('camDenied')) }); else if (i === 2) void att.addDocument() }
    const labels = [t('attachPhoto'), t('attachCamera'), ...(files?.available ? [t('attachFile')] : [])]
    if (att.photoCount >= MAX_IMAGES) labels.splice(0, 2)
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...labels, t('cancel')], cancelButtonIndex: labels.length }, i => { if (i < labels.length) run(att.photoCount >= MAX_IMAGES ? 2 : i) })
    else Alert.alert(t('attach'), undefined, [...labels.map((l, i) => ({ text: l, onPress: () => run(att.photoCount >= MAX_IMAGES ? 2 : i) })), { text: t('cancel'), style: 'cancel' as const }])
  }
  const pill = (on: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: on ? 12 : 9, height: 34, minWidth: 34, justifyContent: 'center' as const, borderRadius: 17, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface })
  const warn = hasPhotos && !model?.vision ? t('attachNeedsModel') : !att.ready && !att.hasFailed ? t('fileWait') : note
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: th.bg, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {img && <Pressable onPress={image?.onPick} accessibilityRole="button"><Text style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('imgOneShot')} · {t('imgModelRow', { m: image?.modelName ?? '' })} ›</Text></Pressable>}
      {research && <Text accessibilityRole="text" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('researchNote')}</Text>}
      {!!warn && !img && <Text accessibilityRole="alert" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{warn}</Text>}
      <View style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 22, backgroundColor: th.surface, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
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
        <TextInput testID="composer-input" value={text} onChangeText={setText} multiline placeholder={t(img ? 'imgPlaceholder' : research ? 'researchPlaceholder' : hasPhotos ? 'placeholderFile' : 'placeholder')} placeholderTextColor={th.muted2}
          style={{ color: th.ink, fontSize: 16, lineHeight: 22, maxHeight: 150, minHeight: 24, paddingTop: 0, paddingBottom: 6 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!img && <Pressable testID="pill-attach" accessibilityRole="button" accessibilityLabel={t('attach')} onPress={openAttach} style={pill(false)}><Icon name="Plus" size={18} color={th.muted} /></Pressable>}
          {webAvailable && <Pressable testID="pill-web" accessibilityRole="button" accessibilityLabel={t('web')} accessibilityState={{ selected: web }} onPress={() => setWeb(v => !v)} style={pill(web)}><Icon name="Globe" size={16} color={web ? th.accentStrong : th.muted} />{web && <Text style={{ color: th.accentStrong, fontSize: 13, fontWeight: '600' }}>{t('web')}</Text>}</Pressable>}
          {webAvailable && researchAvailable && <Pressable testID="pill-research" accessibilityRole="button" accessibilityLabel={t('researchPill')} accessibilityState={{ selected: research }} onPress={() => { setResearch(v => !v); setImg(false) }} style={pill(research)}><Icon name="Research" size={16} color={research ? th.accentStrong : th.muted} />{research && <Text style={{ color: th.accentStrong, fontSize: 13, fontWeight: '600' }}>{t('researchPill')}</Text>}</Pressable>}
          {image?.available && <Pressable testID="pill-image" accessibilityRole="button" accessibilityLabel={t('imgPill')} accessibilityState={{ selected: img }} onPress={() => { setImg(v => !v); setResearch(false) }} style={pill(img)}><Icon name="Image" size={16} color={img ? th.accentStrong : th.muted} />{img && <Text style={{ color: th.accentStrong, fontSize: 13, fontWeight: '600' }}>{t('imgPill')}</Text>}</Pressable>}
          <View style={{ flex: 1 }} />
          {busy
            ? <Pressable testID="send-stop" accessibilityRole="button" accessibilityLabel={t('stop')} onPress={onStop} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: th.ink, alignItems: 'center', justifyContent: 'center' }}><Icon name="Stop" size={16} color={th.bg} /></Pressable>
            : <Pressable testID="send-go" accessibilityRole="button" accessibilityLabel={t('send')} accessibilityState={{ disabled: !can }} disabled={!can} onPress={submit} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: can ? th.accent : th.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="Send" size={18} color={can ? th.accentInk : th.muted2} /></Pressable>}
        </View>
      </View>
    </View>
  )
}
