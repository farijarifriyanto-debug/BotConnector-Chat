import * as Clipboard from 'expo-clipboard'
import React, { useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { LANGUAGES, languageName, translateText } from '../lib/translate'
import { useChat } from '../store/chat'
import { useTranslate } from '../store/translate'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { ModelIcon } from './ModelIcon'

/**
 * The reference app's standalone Translate page: source text, result, language chip, translate
 * or stop, and Paste / Copy / Clear all in the bar. The model and prompt live in Translation
 * model settings, like the reference's default-model page.
 */
export function TranslatePage({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const models = useChat(s => s.models), chatModelId = useChat(s => s.modelId)
  const { target, prompt, model: savedModel, think, setTarget, setModel } = useTranslate()
  const model = models.find(m => m.id === (savedModel ?? chatModelId)) ?? models[0]
  const [source, setSource] = useState(''), [result, setResult] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [langOpen, setLangOpen] = useState(false), [modelOpen, setModelOpen] = useState(false)
  const running = useRef<AbortController | null>(null)

  const run = async () => {
    if (busy || !source.trim()) return
    if (!model) { setError(t('trNoModel')); return }
    const ctrl = new AbortController(); running.current = ctrl
    setBusy(true); setError(null); setResult('')
    try {
      await translateText({ text: source, target, model: model.id, prompt, think, signal: ctrl.signal, onText: setResult })
    } catch { if (!ctrl.signal.aborted) setError(t('trFail')) }
    finally { if (running.current === ctrl) { running.current = null; setBusy(false) } }
  }
  const stop = () => { running.current?.abort(); running.current = null; setBusy(false) }
  const clear = () => { stop(); setSource(''); setResult(''); setError(null) }
  const paste = async () => { try { const text = await Clipboard.getStringAsync(); if (text) setSource(text) } catch { /* nothing to paste */ } }
  const copy = () => { if (result) void Clipboard.setStringAsync(result) }

  const action = (id: string, label: string, icon: Parameters<typeof Icon>[0]['name'], onPress: () => void) => (
    <Pressable testID={id} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ padding: 6 }}><Icon name={icon} size={18} color={th.muted} /></Pressable>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700', flex: 1 }}>{t('trPageTitle')}</Text>
          {action('tr-page-paste', t('trPaste'), 'Copy', () => void paste())}
          {action('tr-page-copy', t('trCopy'), 'Copy', copy)}
          {action('tr-page-clear', t('trClear'), 'Close', clear)}
          <Pressable testID="tr-page-model" onPress={() => setModelOpen(true)} accessibilityRole="button" accessibilityLabel={model?.name ?? t('trModelLabel')} hitSlop={8} style={{ padding: 6 }}>
            {model ? <ModelIcon model={model} size={22} /> : <Icon name="Boxes" size={18} color={th.muted} />}
          </Pressable>
          <Pressable testID="tr-page-close" onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')} style={{ padding: 6 }}><Icon name="Close" size={18} color={th.ink} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 12, backgroundColor: th.surface, padding: 12, height: 200 }}>
            <TextInput testID="tr-page-source" value={source} onChangeText={setSource} multiline contextMenuHidden placeholder={t('trSourcePh')} placeholderTextColor={th.muted2}
              style={{ color: th.ink, fontSize: 16, lineHeight: 22, flex: 1, textAlignVertical: 'top' }} />
          </View>
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: th.line, borderRadius: 12, backgroundColor: th.surface2, padding: 12, minHeight: 160 }}>
            <TextInput testID="tr-page-result" value={result} editable={false} multiline placeholder={t('trResultPh')} placeholderTextColor={th.muted2}
              style={{ color: th.ink, fontSize: 16, lineHeight: 22, flex: 1, textAlignVertical: 'top' }} />
          </View>
          {!!error && <Text testID="tr-page-error" accessibilityRole="alert" style={{ color: th.danger, fontSize: 13, marginTop: 10 }}>{error}</Text>}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <Pressable testID="tr-page-lang" onPress={() => setLangOpen(true)} accessibilityRole="button" accessibilityLabel={t('trLang')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
              <Icon name="Globe" size={16} color={th.muted} />
              <Text style={{ color: th.ink, fontWeight: '600', fontSize: 13.5 }}>{languageName(target)}</Text>
              <Icon name="ChevR" size={14} color={th.muted2} />
            </Pressable>
            <View style={{ flex: 1 }} />
            {busy
              ? <Pressable testID="tr-page-stop" onPress={stop} accessibilityRole="button" accessibilityLabel={t('trStop')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: th.accent }}><Icon name="Stop" size={14} color={th.accentInk} /><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('trStop')}</Text></Pressable>
              : <Pressable testID="tr-page-go" onPress={() => void run()} disabled={!source.trim()} accessibilityRole="button" accessibilityLabel={t('trGo')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: source.trim() ? th.accent : th.surface3 }}><Icon name="ArrowLeftRight" size={16} color={source.trim() ? th.accentInk : th.muted2} /><Text style={{ color: source.trim() ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('trGo')}</Text></Pressable>}
          </View>
        </ScrollView>

        <Modal visible={langOpen} transparent animationType="fade" onRequestClose={() => setLangOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setLangOpen(false)} accessibilityLabel={t('close')}>
            <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12, maxHeight: '70%' }}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 }}>{t('trLang')}</Text>
              <ScrollView>
                {LANGUAGES.map(l => (
                  <Pressable key={l.code} testID={`tr-page-lang-${l.code}`} onPress={() => { setTarget(l.code); setLangOpen(false) }} accessibilityRole="button" accessibilityState={{ selected: target === l.code }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 6 }}>
                    <Text style={{ color: th.ink, fontSize: 15 }}>{l.name}</Text>
                    {target === l.code && <Icon name="Check" size={18} color={th.accentStrong} />}
                  </Pressable>))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={modelOpen} transparent animationType="fade" onRequestClose={() => setModelOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setModelOpen(false)} accessibilityLabel={t('close')}>
            <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12, maxHeight: '70%' }}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 }}>{t('trModelLabel')}</Text>
              <ScrollView>
                <Pressable testID="tr-page-model-default" onPress={() => { setModel(null); setModelOpen(false) }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 6 }}>
                  <Icon name="Refresh" size={18} color={th.muted} /><Text style={{ color: th.ink, fontSize: 15, flex: 1 }}>{t('trModelDefault')}</Text>
                </Pressable>
                {models.filter(m => !m.image).map(m => (
                  <Pressable key={m.id} testID={`tr-page-model-${m.id}`} onPress={() => { setModel(m.id); setModelOpen(false) }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 6 }}>
                    <ModelIcon model={m} size={20} /><Text numberOfLines={1} style={{ color: th.ink, fontSize: 15, flex: 1 }}>{m.name}</Text>
                    {(savedModel ?? chatModelId) === m.id && <Icon name="Check" size={18} color={th.accentStrong} />}
                  </Pressable>))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  )
}
