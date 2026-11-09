import React, { useEffect, useRef, useState } from 'react'
import { decodeProviderImport, ProviderImportError } from '../lib/providerImport'
import { ProviderQrScanner } from './ProviderQrScanner'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { useChat } from '../store/chat'
import { useProviders, type AddFailure } from '../store/providers'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1' },
  { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { name: 'xAI', url: 'https://api.x.ai/v1' },
  { name: 'Mistral', url: 'https://api.mistral.ai/v1' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { name: 'Together AI', url: 'https://api.together.xyz/v1' },
  { name: 'Fireworks', url: 'https://api.fireworks.ai/inference/v1' },
  { name: 'DeepInfra', url: 'https://api.deepinfra.com/v1/openai' },
  { name: 'Cerebras', url: 'https://api.cerebras.ai/v1' },
  { name: 'SambaNova', url: 'https://api.sambanova.ai/v1' },
  { name: 'NVIDIA NIM', url: 'https://integrate.api.nvidia.com/v1' },
  { name: 'Hugging Face', url: 'https://router.huggingface.co/v1' },
  { name: 'Perplexity', url: 'https://api.perplexity.ai' },
  { name: 'Moonshot (Kimi)', url: 'https://api.moonshot.ai/v1' },
  { name: 'Z.ai (GLM)', url: 'https://api.z.ai/api/paas/v4' },
  { name: 'Alibaba Qwen', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  { name: 'Ollama', url: 'http://192.168.1.10:11434/v1' },
  { name: 'LM Studio', url: 'http://192.168.1.10:1234/v1' },
  { name: 'llama.cpp', url: 'http://192.168.1.10:8080/v1' },
]
const REASON: Partial<Record<AddFailure, 'provUrl' | 'provHttps' | 'provName' | 'provLoadFail' | 'errBadKey' | 'errNetwork'>> = { url: 'provUrl', https: 'provHttps', name: 'provName', models: 'provLoadFail', badkey: 'errBadKey', network: 'errNetwork' }
const host = (u: string) => { try { return new URL(u).host } catch { return u } }

export function ProvidersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <ProviderEditor onClose={onClose} /> : null
}

function ProviderEditor({ onClose }: { onClose: () => void }) {
  const visible = true
  const th = useTheme(), t = useT(), providers = useProviders(s => s.providers)
  const [picked, setPicked] = useState<string | null>(null), [adding, setAdding] = useState(false), [name, setName] = useState(''), [url, setUrl] = useState(''), [key, setKey] = useState(''), [manual, setManual] = useState('')
  const [kind, setKind] = useState<'anthropic' | undefined>(undefined)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<AddFailure | null>(null), [refreshing, setRefreshing] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'choices' | 'scan' | 'paste' | 'form'>('list'), [raw, setRaw] = useState(''), [importError, setImportError] = useState<'qrInvalid' | 'qrUnsupported' | 'qrUrl' | null>(null), [imported, setImported] = useState(false), [reading, setReading] = useState(false)
  const epoch = useRef(0)
  // Guideline 5.1.2(i): before the first provider is saved the person agrees that chats go from this phone to that provider; remembered once saved.
  const consented = useSettings(s => s.dataConsent), [agreed, setAgreed] = useState(false), blocked = !consented && !agreed
  const reset = () => { epoch.current++; setAgreed(false); setMode('list'); setRaw(''); setImportError(null); setImported(false); setReading(false); setPicked(null); setAdding(false); setName(''); setUrl(''); setKey(''); setManual(''); setErr(null); setBusy(false); setKind(undefined) }
  useEffect(() => () => { epoch.current = -1 }, [])
  const changeMode = (next: typeof mode) => { epoch.current++; setMode(next); setImportError(null); setReading(false) }
  const importText = (text: string) => {
    try {
      const config = decodeProviderImport(text)
      setName(config.name); setUrl(config.baseUrl); setKey(config.apiKey); setManual(''); setRaw(''); setPicked(null); setImported(true); setAdding(true); changeMode('form'); setKind(config.kind)
    } catch (e) { setImportError(e instanceof ProviderImportError && e.code === 'unsupported' ? 'qrUnsupported' : e instanceof ProviderImportError && e.code === 'url' ? 'qrUrl' : 'qrInvalid'); if (mode === 'scan') setMode('choices') }
  }
  const close = () => { if (!busy) { reset(); onClose() } }
  const save = async () => {
    setBusy(true); setErr(null)
    const r = await useProviders.getState().add({ name, baseUrl: url, apiKey: key, manualModels: manual, kind })
    if (r.ok) { useSettings.getState().acceptDataConsent(); useChat.getState().syncCustom(); reset() } else { setBusy(false); setErr(r.reason) }
  }
  const refresh = async (id: string) => { setRefreshing(id); await useProviders.getState().refresh(id); useChat.getState().syncCustom(); setRefreshing(null) }
  const remove = (id: string, n: string) => Alert.alert(n, t('provDeleteQ'), [{ text: t('cancel'), style: 'cancel' }, { text: t('provDelete'), style: 'destructive', onPress: () => { void useProviders.getState().remove(id).then(() => useChat.getState().syncCustom()) } }])
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16, marginTop: 10 } as const
  const reasonKey = err ? REASON[err] ?? 'provLoadFail' : null
  const pickPreset = (presetName: string, destination: string) => {
    if (busy) return
    if (destination !== url) setKey('')
    setImported(false); setErr(null); setPicked(presetName); setName(presetName === 'other' ? '' : presetName); setUrl(destination); setKind(undefined)
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t(adding ? 'provTitle' : 'connectAi')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('close')} testID="providers-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {importError && <Text testID="provider-import-error" accessibilityRole="alert" style={{ color: th.danger, marginVertical: 12, lineHeight: 22 }}>{t(importError)}</Text>}
          {mode === 'scan' && visible ? <ProviderQrScanner onScan={importText} onCancel={() => changeMode('choices')} /> : mode === 'paste' ? <View>
            <Text style={{ color: th.ink, marginTop: 20 }}>{t('qrInput')}</Text>
            <TextInput testID="provider-import-text" accessibilityLabel={t('qrInput')} style={input} value={raw} onChangeText={setRaw} maxLength={16384} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            <Pressable testID="provider-import-submit" accessibilityRole="button" onPress={() => importText(raw)} style={{ minHeight: 50, padding: 15, backgroundColor: th.accent, borderRadius: 14, marginTop: 16 }}><Text style={{ color: th.accentInk, textAlign: 'center' }}>{t('qrImport')}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setRaw(''); changeMode('choices') }} style={{ minHeight: 48, padding: 15 }}><Text style={{ color: th.ink, textAlign: 'center' }}>{t('cancel')}</Text></Pressable>
          </View> : adding ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: th.muted, lineHeight: 22, marginBottom: 12 }}>{t(imported ? 'qrReview' : 'connectManualHint')}</Text>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>{t('provPresets')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {PRESETS.map(p => <Pressable key={p.name} testID={`preset-${p.name}`} disabled={busy} onPress={() => pickPreset(p.name, p.url)} accessibilityRole="button" accessibilityState={{ selected: picked === p.name, disabled: busy }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: picked === p.name ? th.accent : th.lineStrong, backgroundColor: picked === p.name ? th.accentSoft : th.surface }}><Text style={{ color: picked === p.name ? th.accentStrong : th.ink, fontSize: 13.5 }}>{p.name}</Text></Pressable>)}
                <Pressable testID="preset-other" disabled={busy} onPress={() => pickPreset('other', 'https://')} accessibilityRole="button" accessibilityState={{ selected: picked === 'other', disabled: busy }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: picked === 'other' ? th.accent : th.lineStrong, backgroundColor: picked === 'other' ? th.accentSoft : th.surface }}><Text style={{ color: picked === 'other' ? th.accentStrong : th.ink, fontSize: 13.5, fontWeight: '600' }}>{t('provOther')}</Text></Pressable>
              </View>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 10 }}>{t('provOtherNote')}</Text>
              <Text style={{ color: th.muted, marginTop: 16 }}>{t('provName')}</Text>
              <TextInput testID="prov-name" accessibilityLabel={t('provName')} style={input} value={name} onChangeText={setName} placeholder={t('provName')} placeholderTextColor={th.muted2} editable={!busy} maxLength={40} />
              <Text style={{ color: th.muted, marginTop: 16 }}>{t('provKind')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Pressable testID="prov-kind-openai" disabled={busy} onPress={() => setKind(undefined)} accessibilityRole="button" accessibilityState={{ selected: kind !== 'anthropic', disabled: busy }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: kind !== 'anthropic' ? th.accent : th.lineStrong, backgroundColor: kind !== 'anthropic' ? th.accentSoft : th.surface }}><Text style={{ color: kind !== 'anthropic' ? th.accentStrong : th.ink, fontSize: 13.5 }}>{t('provKindOpenai')}</Text></Pressable>
                <Pressable testID="prov-kind-claude" disabled={busy} onPress={() => setKind('anthropic')} accessibilityRole="button" accessibilityState={{ selected: kind === 'anthropic', disabled: busy }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: kind === 'anthropic' ? th.accent : th.lineStrong, backgroundColor: kind === 'anthropic' ? th.accentSoft : th.surface }}><Text style={{ color: kind === 'anthropic' ? th.accentStrong : th.ink, fontSize: 13.5 }}>{t('provKindClaude')}</Text></Pressable>
              </View>
              <Text style={{ color: th.muted, marginTop: 16 }}>{t('provUrlLabel')}</Text>
              <TextInput testID="prov-url" style={input} value={url} onChangeText={setUrl} placeholder={t('provUrlLabel')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
              <Text style={{ color: th.muted, marginTop: 16 }}>{t('provKey')}</Text>
              <TextInput testID="prov-key" accessibilityLabel={t('provKey')} style={input} value={key} onChangeText={setKey} placeholder={t('provKey')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
              {imported && !key && <Text style={{ color: th.muted, marginTop: 8 }}>{t('qrMissing')}</Text>}
              <TextInput testID="prov-models" style={input} value={manual} onChangeText={setManual} placeholder={t('provModelsManual')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} editable={!busy} />
              {!consented && (
                <Pressable testID="prov-data-consent" accessibilityRole="checkbox" accessibilityState={{ checked: agreed, disabled: busy }} disabled={busy} onPress={() => setAgreed(a => !a)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, minHeight: 44 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? th.accent : th.lineStrong, backgroundColor: agreed ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{agreed && <Icon name="Check" size={16} color={th.accentInk} />}</View>
                  <Text style={{ flex: 1, color: th.ink, lineHeight: 21 }}>{t('dataConsent')}</Text>
                </Pressable>)}
              {!!reasonKey && <Text testID="prov-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{t(reasonKey)}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable testID="prov-cancel" onPress={reset} disabled={busy} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                <Pressable testID="prov-save" onPress={save} disabled={busy || blocked || !name.trim() || !url.trim()} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center', opacity: busy || blocked || !name.trim() || !url.trim() ? 0.5 : 1 }}>
                  {busy ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('qrFetch')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : mode === 'choices' || providers.length === 0 ? <View style={{ paddingTop: 20 }}>
            <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 28, fontWeight: '600', letterSpacing: -0.6 }}>{t('connectChoice')}</Text>
            <Text style={{ color: th.muted, fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 24 }}>{t('connectChoiceHint')}</Text>
            {([
              { id: 'provider-manual', icon: 'Key', title: 'connectManual', hint: 'connectManualHint', next: 'form' },
            ] as const).map(option => <Pressable key={option.id} testID={option.id} accessibilityRole="button" onPress={() => { changeMode(option.next); if (option.next === 'form') setAdding(true) }} style={{ borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface, borderRadius: 17, padding: 18, flexDirection: 'row', gap: 14, marginBottom: 12 }}><Icon name={option.icon} color={th.accentStrong} /><View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600', fontSize: 16 }}>{t(option.title)}</Text><Text style={{ color: th.muted, lineHeight: 20, marginTop: 7 }}>{t(option.hint)}</Text></View><Icon name="ChevR" color={th.muted} /></Pressable>)}
            <Text style={{ color: th.muted, fontSize: 12, lineHeight: 19, marginTop: 16 }}>{t('qrCost')}</Text>
          </View> : (
            <View style={{ marginTop: 12 }}>
              {providers.length === 0 && <Text style={{ color: th.muted, textAlign: 'center', marginVertical: 24 }}>{t('provNone')}</Text>}
              {providers.map(p => (
                <View key={p.id} testID={`provider-${p.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.ink, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{host(p.baseUrl)} · {t('provSaved', { n: p.models.length })}</Text>
                  </View>
                  <Pressable onPress={() => refresh(p.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('provRefresh')} testID={`refresh-${p.name}`}>{refreshing === p.id ? <ActivityIndicator color={th.muted} /> : <Icon name="Refresh" size={20} color={th.muted} />}</Pressable>
                  <Pressable onPress={() => remove(p.id, p.name)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('provDelete')} testID={`remove-${p.name}`}><Icon name="Trash" size={20} color={th.danger} /></Pressable>
                </View>))}
              <Pressable testID="prov-new" onPress={() => changeMode('choices')} accessibilityRole="button" style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center' }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('provAdd')}</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
