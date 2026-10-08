import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { useChat } from '../store/chat'
import { useProviders, type AddFailure } from '../store/providers'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1' },
  { name: 'Anthropic', url: 'https://api.anthropic.com/v1' },
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
  const th = useTheme(), t = useT(), providers = useProviders(s => s.providers)
  const [picked, setPicked] = useState<string | null>(null), [adding, setAdding] = useState(false), [name, setName] = useState(''), [url, setUrl] = useState(''), [key, setKey] = useState(''), [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState<AddFailure | null>(null), [refreshing, setRefreshing] = useState<string | null>(null)
  const reset = () => { setPicked(null); setAdding(false); setName(''); setUrl(''); setKey(''); setManual(''); setErr(null); setBusy(false) }
  const close = () => { if (!busy) { reset(); onClose() } }
  const save = async () => {
    setBusy(true); setErr(null)
    const r = await useProviders.getState().add({ name, baseUrl: url, apiKey: key, manualModels: manual })
    if (r.ok) { useChat.getState().syncCustom(); reset() } else { setBusy(false); setErr(r.reason) }
  }
  const refresh = async (id: string) => { setRefreshing(id); await useProviders.getState().refresh(id); useChat.getState().syncCustom(); setRefreshing(null) }
  const remove = (id: string, n: string) => Alert.alert(n, t('provDeleteQ'), [{ text: t('cancel'), style: 'cancel' }, { text: t('provDelete'), style: 'destructive', onPress: () => { void useProviders.getState().remove(id).then(() => useChat.getState().syncCustom()) } }])
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16, marginTop: 10 } as const
  const reasonKey = err ? REASON[err] ?? 'provLoadFail' : null
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('provTitle')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('close')} testID="providers-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('provPrivacy')}</Text>
          {adding ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>{t('provPresets')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {PRESETS.map(p => <Pressable key={p.name} testID={`preset-${p.name}`} onPress={() => { setPicked(p.name); setName(p.name); setUrl(p.url) }} accessibilityRole="button" accessibilityState={{ selected: picked === p.name }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: picked === p.name ? th.accent : th.lineStrong, backgroundColor: picked === p.name ? th.accentSoft : th.surface }}><Text style={{ color: picked === p.name ? th.accentStrong : th.ink, fontSize: 13.5 }}>{p.name}</Text></Pressable>)}
                <Pressable testID="preset-other" onPress={() => { setPicked('other'); setName(''); setUrl('https://') }} accessibilityRole="button" accessibilityState={{ selected: picked === 'other' }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: picked === 'other' ? th.accent : th.lineStrong, backgroundColor: picked === 'other' ? th.accentSoft : th.surface }}><Text style={{ color: picked === 'other' ? th.accentStrong : th.ink, fontSize: 13.5, fontWeight: '600' }}>{t('provOther')}</Text></Pressable>
              </View>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 10 }}>{t('provOtherNote')}</Text>
              <TextInput testID="prov-name" style={input} value={name} onChangeText={setName} placeholder={t('provName')} placeholderTextColor={th.muted2} editable={!busy} maxLength={40} />
              <TextInput testID="prov-url" style={input} value={url} onChangeText={setUrl} placeholder={t('provUrlLabel')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
              <TextInput testID="prov-key" style={input} value={key} onChangeText={setKey} placeholder={t('provKey')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
              <TextInput testID="prov-models" style={input} value={manual} onChangeText={setManual} placeholder={t('provModelsManual')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} editable={!busy} />
              {!!reasonKey && <Text testID="prov-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{t(reasonKey)}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable testID="prov-cancel" onPress={reset} disabled={busy} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                <Pressable testID="prov-save" onPress={save} disabled={busy || !name.trim() || !url.trim()} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center', opacity: busy || !name.trim() || !url.trim() ? 0.5 : 1 }}>
                  {busy ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('provAdd')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
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
              <Pressable testID="prov-new" onPress={() => setAdding(true)} accessibilityRole="button" style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center' }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('provAdd')}</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
