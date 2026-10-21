import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { legalUrl, type LegalPage } from '../lib/links'
import { useAuth } from '../store/auth'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'

type Consent = 'privacy' | 'terms' | 'data'

/** First Sign in with Apple: the same currency choice and three consents as the web sign-up (legally required), nothing more. */
export function AppleSignupSheet() {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang)
  const pending = useAuth(a => a.applePending), busy = useAuth(a => a.busy), error = useAuth(a => a.error)
  const [name, setName] = useState(''), [currency, setCurrency] = useState<'IDR' | 'USD'>('IDR')
  const [agreed, setAgreed] = useState<Record<Consent, boolean>>({ privacy: false, terms: false, data: false })
  useEffect(() => { if (pending) { setName(pending.displayName); setCurrency('IDR'); setAgreed({ privacy: false, terms: false, data: false }) } }, [pending])
  const all = agreed.privacy && agreed.terms && agreed.data
  const link = (page: LegalPage) => void Linking.openURL(legalUrl(page, lang)).catch(() => {})
  const box = (k: Consent, label: string, page: LegalPage) => (
    <Pressable key={k} testID={`apple-consent-${k}`} onPress={() => setAgreed(a => ({ ...a, [k]: !a[k] }))} accessibilityRole="checkbox" accessibilityState={{ checked: agreed[k] }}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agreed[k] ? th.accent : th.lineStrong, backgroundColor: agreed[k] ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {agreed[k] && <Text style={{ color: th.accentInk, fontWeight: '800', fontSize: 13 }}>✓</Text>}
      </View>
      <Text style={{ flex: 1, color: th.ink, fontSize: 14.5, lineHeight: 21 }}>{label} <Text onPress={() => link(page)} accessibilityRole="link" style={{ color: th.accentStrong, fontWeight: '600' }}>{t(page === 'privacy' ? 'legalPrivacy' : 'legalTerms')}</Text></Text>
    </Pressable>)
  const cur = (v: 'IDR' | 'USD', label: string) => (
    <Pressable key={v} testID={`apple-currency-${v}`} onPress={() => setCurrency(v)} accessibilityRole="radio" accessibilityState={{ selected: currency === v }}
      style={{ flex: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: currency === v ? th.accentSoft : th.surface }}>
      <Text style={{ color: currency === v ? th.accentStrong : th.ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>)
  const msg = error?.startsWith('apple_') ? t(error === 'apple_exists' ? 'appleErrExists' : 'appleErrFailed') : null
  return (
    <Modal visible={!!pending} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) useAuth.getState().cancelAppleSignup() }}>
      <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 22, fontWeight: '800' }}>{t('appleSignupTitle')}</Text>
        <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22, marginTop: 8 }}>{t('appleSignupBody')}</Text>
        {!!pending && <View style={{ marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: th.surface, borderWidth: 1, borderColor: th.line }}>
          <Text testID="apple-signup-email" style={{ color: th.ink, fontWeight: '600' }}>{pending.email}</Text>
          {pending.isPrivateEmail && <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{t('appleSignupRelay')}</Text>}
        </View>}
        <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>{t('appleSignupName')}</Text>
        <TextInput testID="apple-signup-name" value={name} onChangeText={setName} maxLength={120} autoComplete="name" textContentType="name" editable={!busy}
          style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
        <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>{t('appleCurrency')}</Text>
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, overflow: 'hidden' }}>{cur('IDR', t('appleCurIDR'))}{cur('USD', t('appleCurUSD'))}</View>
        <View style={{ marginTop: 14 }}>
          {box('privacy', t('appleConsentPrivacy'), 'privacy')}
          {box('terms', t('appleConsentTerms'), 'terms')}
          {box('data', t('appleConsentData'), 'privacy')}
        </View>
        {!!msg && <Text testID="apple-signup-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{msg}</Text>}
        <Pressable testID="apple-signup-create" onPress={() => void useAuth.getState().completeAppleSignup(currency, name)} disabled={busy || !all} accessibilityRole="button" accessibilityState={{ disabled: busy || !all }}
          style={{ marginTop: 18, padding: 15, borderRadius: 14, backgroundColor: th.accent, alignItems: 'center', opacity: busy || !all ? 0.5 : 1 }}>
          {busy ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: th.accentInk, fontSize: 16, fontWeight: '700' }}>{t('appleSignupCreate')}</Text>}
        </Pressable>
        <Pressable testID="apple-signup-cancel" onPress={() => useAuth.getState().cancelAppleSignup()} disabled={busy} accessibilityRole="button" style={{ marginTop: 10, padding: 13, alignItems: 'center' }}>
          <Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  )
}
