import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { pickPhotos } from '../lib/attachments'
import { base64ToBytes, sha256Hex, splitDataUrl } from '../lib/bytes'
import { videoContentUrl, videoHeaders } from '../api/api'
import { useVideo } from '../store/video'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { ModelSheet } from './ModelSheet'

const RATIOS = ['16:9', '9:16', '1:1'] as const

/**
 * Video Studio: pick a video model, check the price, make one clip and watch it here.
 * The job runs on the server (quote -> submit -> poll), so the phone may close the screen.
 */
export function VideoStudio({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const v = useVideo()
  const [prompt, setPrompt] = useState(''), [aspect, setAspect] = useState<typeof RATIOS[number]>('16:9')
  const [models, setModels] = useState(false)
  const [source, setSource] = useState<{ dataUrl: string; mime: string; base64: string; sha: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { if (visible && v.state === 'idle') void v.load() }, [visible, v.state])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!visible) { setPrompt(''); setSource(null); setNote(null); v.clear() } }, [visible])   // eslint-disable-line react-hooks/exhaustive-deps

  const model = v.models.find(m => m.id === v.selectedId)
  const needsImage = model?.requiresImage === true
  // Price is asked again whenever the model, the ratio or the source picture changes.
  useEffect(() => {
    if (!visible || !model) return
    if (needsImage && !source) return
    const id = setTimeout(() => void v.askQuote({ aspect, sourceSha256: source?.sha }), 300)
    return () => clearTimeout(id)
  }, [visible, model?.id, aspect, source?.sha, needsImage])   // eslint-disable-line react-hooks/exhaustive-deps

  const price = v.quote ? (v.quote.micros / 1_000_000).toFixed(2) : null
  const canStart = !!model && !!v.quote && prompt.trim().length >= 3 && !v.busy && (!needsImage || !!source)
  const running = v.busy && !!v.job
  const done = v.job?.status === 'completed'
  const failed = v.job?.status === 'failed' || !!v.error

  const pickSource = async () => {
    setNote(null)
    const [a] = await pickPhotos(1).catch(() => [])
    const parts = a?.dataUrl ? splitDataUrl(a.dataUrl) : null
    if (!parts) { setNote(t('vidNeedImage')); return }
    setSource({ dataUrl: a.dataUrl!, mime: parts.mime, base64: parts.base64, sha: sha256Hex(base64ToBytes(parts.base64)) })
  }
  const start = () => {
    if (!canStart) return
    void v.create({ prompt, aspect, ...(source ? { sourceBase64: source.base64, sourceMime: source.mime, sourceSha256: source.sha } : {}) })
  }
  const seg = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: on ? th.accentStrong : th.lineStrong, backgroundColor: on ? th.accentSoft : 'transparent' } as const)
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 15 } as const
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{txt}</Text>
  const asModel = useMemo(() => v.models.map(m => ({ id: m.id, name: m.name, access: m.access, vision: false, tools: false, reasoning: false, available: true })), [v.models])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('vidTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('done')} testID="video-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('vidNote')}</Text>

          {label(t('vidModel'))}
          <Pressable testID="video-model" onPress={() => setModels(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{model ? model.name : t('vidNoModel')}</Text>
              {!!model && <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{model.durationSeconds} dtk · {model.resolution} · {model.textToVideo ? t('vidT2V') : t('vidI2V')}</Text>}
            </View>
            <Icon name="Chevron" size={16} color={th.muted} />
          </Pressable>
          {v.state === 'error' && <Pressable testID="video-retry" onPress={() => void v.load()} accessibilityRole="button"><Text style={{ color: th.danger, marginTop: 10 }}>{t('modelsError')} {t('retry')}</Text></Pressable>}
          {v.state === 'loading' && <ActivityIndicator color={th.muted} style={{ marginTop: 12 }} />}

          {label(t('vidPrompt'))}
          <TextInput testID="video-prompt" style={[input, { minHeight: 96, textAlignVertical: 'top' }]} multiline value={prompt} onChangeText={setPrompt} placeholder={t('vidPromptPh')} placeholderTextColor={th.muted2} maxLength={2000} />

          {label(t('vidAspect'))}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {RATIOS.map(r => (
              <Pressable key={r} testID={`video-aspect-${r}`} onPress={() => setAspect(r)} accessibilityRole="button" accessibilityState={{ selected: aspect === r }} style={seg(aspect === r)}>
                <Text style={{ color: aspect === r ? th.accentStrong : th.ink, fontWeight: aspect === r ? '700' : '400' }}>{r}</Text>
              </Pressable>))}
          </View>

          {needsImage && (
            <>
              {label(t('vidSource'))}
              <Pressable testID="video-source" onPress={() => void pickSource()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
                {source ? <Image source={{ uri: source.dataUrl }} style={{ width: 56, height: 56, borderRadius: 8 }} accessibilityIgnoresInvertColors /> : <Icon name="Image" size={18} color={th.muted} />}
                <Text style={{ color: th.ink }}>{source ? t('vidChangeImage') : t('vidPickImage')}</Text>
              </Pressable>
              {!!note && <Text style={{ color: th.danger, marginTop: 8 }}>{note}</Text>}
            </>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <Text style={{ color: th.muted, flex: 1 }}>{v.quote ? t('vidPrice', { p: price!, s: v.quote.durationSeconds }) : needsImage && !source ? t('vidNeedImage') : t('vidChecking')}</Text>
            <Pressable testID="video-start" onPress={start} disabled={!canStart} accessibilityRole="button" accessibilityState={{ disabled: !canStart }}
              style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: canStart ? th.accent : th.surface3 }}>
              <Text style={{ color: canStart ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('vidStart')}</Text>
            </Pressable>
          </View>

          {running && (
            <View testID="video-running" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 12, borderRadius: 12, backgroundColor: th.surface3 }}>
              <ActivityIndicator color={th.accent} />
              <Text style={{ color: th.ink, flex: 1 }}>{t('vidRunning', { s: v.job?.status ?? '' })}</Text>
              <Pressable testID="video-cancel" onPress={v.cancel} accessibilityRole="button"><Text style={{ color: th.danger, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
            </View>)}

          {failed && !running && (
            <Text testID="video-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 16 }}>
              {v.error === 'video_needs_balance' ? t('needBalance') : t('vidFailed')}
            </Text>)}

          {done && !!v.job && (
            <View style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden', backgroundColor: th.surface3, aspectRatio: aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : 16 / 9 }}>
              <WebView testID="video-player" originWhitelist={['*']} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
                source={{ uri: videoContentUrl(v.job.id), headers: videoHeaders() }}
                style={{ flex: 1, backgroundColor: th.surface3 }} />
            </View>)}
        </ScrollView>
        <ModelSheet mode="video" visible={models} models={asModel} selected={v.selectedId} onSelect={id => { v.select(id); setModels(false) }} onClose={() => setModels(false)} />
      </View>
    </Modal>
  )
}
