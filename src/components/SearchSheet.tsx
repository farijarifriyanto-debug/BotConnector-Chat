import React, { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { BYOK_PROVIDERS, type SearchProviderId } from '../api/search'
import { useT } from '../hooks/useT'
import { RESULT_COUNTS, useSearch } from '../store/search'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const NAME: Record<SearchProviderId, string> = { botconnector: 'BotConnector', brave: 'Brave', tavily: 'Tavily', exa: 'Exa', parallel: 'Parallel' }

/** Web search: BotConnector Search by default, or the user's own Brave / Tavily / Exa / Parallel key. */
export function SearchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), { provider, count, hasKey } = useSearch()
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<string | null>(null)
  useEffect(() => { if (visible) void useSearch.getState().load() }, [visible])
  useEffect(() => { setKey(''); setResult(null) }, [provider])
  const byok = provider !== 'botconnector'
  const saveKey = async () => { if (byok && key.trim()) { await useSearch.getState().setKey(provider, key); setKey('') } }
  const test = async () => { setBusy(true); setResult(null); if (key.trim() && byok) await useSearch.getState().setKey(provider, key); const r = await useSearch.getState().test(); setResult(r.ok ? t('srchTestOk', { n: r.n }) : t('srchTestFail')); setBusy(false) }
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const row = (id: SearchProviderId) => (
    <Pressable key={id} testID={`srch-${id}`} onPress={() => useSearch.getState().setProvider(id)} accessibilityRole="radio" accessibilityState={{ selected: provider === id }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: provider === id ? th.accent : th.line, backgroundColor: provider === id ? th.accentSoft : th.surface }}>
      <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600' }}>{id === 'botconnector' ? t('srchDefault') : NAME[id]}</Text>{id === 'botconnector' ? <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{t('srchDefaultNote')}</Text> : hasKey[id] ? <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{t('srchKeySet')}</Text> : null}</View>
      {provider === id && <Icon name="Check" size={18} color={th.accentStrong} />}
    </Pressable>)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('srchTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="search-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('srchPrivacy')}</Text>
          {label(t('srchProvider'))}
          {row('botconnector')}{BYOK_PROVIDERS.map(row)}
          {byok && <View>
            {label(t('srchKey'))}
            <TextInput testID="srch-key" value={key} onChangeText={setKey} onBlur={saveKey} placeholder={hasKey[provider] ? '••••••••' : t('srchKeyPh', { p: NAME[provider] })} placeholderTextColor={th.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 12 }}>
              <Pressable testID="srch-test" onPress={test} disabled={busy || (!key.trim() && !hasKey[provider])} accessibilityRole="button" style={{ opacity: busy || (!key.trim() && !hasKey[provider]) ? 0.5 : 1 }}>{busy ? <ActivityIndicator color={th.muted} /> : <Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('srchTest')}</Text>}</Pressable>
              {!!hasKey[provider] && <Pressable testID="srch-clear" onPress={() => void useSearch.getState().setKey(provider, '')} accessibilityRole="button"><Text style={{ color: th.danger, fontWeight: '600' }}>{t('srchKeyClear')}</Text></Pressable>}
            </View>
            {!!result && <Text testID="srch-result" style={{ color: th.muted, marginTop: 8 }}>{result}</Text>}
          </View>}
          {label(t('srchCount'))}
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, overflow: 'hidden' }}>
            {RESULT_COUNTS.map(n => <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: count === n }} onPress={() => useSearch.getState().setCount(n)} style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: count === n ? th.accentSoft : th.surface }}><Text style={{ color: count === n ? th.accentStrong : th.ink, fontWeight: '600' }}>{n}</Text></Pressable>)}
          </View>
          <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{t('srchCountNote')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
