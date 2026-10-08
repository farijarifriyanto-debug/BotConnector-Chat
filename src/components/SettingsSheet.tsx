import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useT } from '../hooks/useT'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSettings, type ThemePref } from '../store/settings'
import { useTheme } from '../theme/theme'
import type { DeleteFailure } from '../auth/session'
import { Icon } from './Icons'
import { ProvidersSheet } from './ProvidersSheet'

export const DELETE_PHRASE = 'HAPUS AKUN'   // the server accepts only this exact phrase, whatever the app language is
const REASON = { wrong_password: 'dAcctWrong', confirmation: 'dAcctBadPhrase', rate_limited: 'dAcctRate', session: 'dAcctSession', unavailable: 'dAcctDown', network: 'dAcctNet' } as const

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), s = useSettings(), account = useAuth(a => a.account)
  const [providers, setProviders] = useState(false), [deleting, setDeleting] = useState(false), [pw, setPw] = useState(''), [phrase, setPhrase] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<DeleteFailure | null>(null)
  const done = () => { setDeleting(false); setPw(''); setPhrase(''); setErr(null); setBusy(false) }
  const close = () => { if (!busy) { done(); onClose() } }
  const confirmLogout = () => Alert.alert(t('logout'), t('logoutConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('logout'), style: 'destructive', onPress: () => { onClose(); useChat.getState().reset(); void useAuth.getState().logout() } }])
  const doDelete = async () => {
    setBusy(true); setErr(null)
    const r = await useAuth.getState().deleteAccount(pw, phrase.trim())
    if (r.ok || r.reason === 'session') { useChat.getState().reset(); done(); onClose(); return }
    setBusy(false); setErr(r.reason)
  }
  const seg = <T extends string>(value: T, items: { v: T; label: string }[], set: (v: T) => void) => (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, overflow: 'hidden' }}>
      {items.map(i => <Pressable key={i.v} testID={`seg-${i.v}`} accessibilityRole="button" accessibilityState={{ selected: value === i.v }} onPress={() => set(i.v)} style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: value === i.v ? th.accentSoft : th.surface }}><Text style={{ color: value === i.v ? th.accentStrong : th.ink, fontWeight: '600', fontSize: 14 }}>{i.label}</Text></Pressable>)}
    </View>)
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{txt}</Text>
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16, marginTop: 10 } as const
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{deleting ? t('dAcctTitle') : t('settings')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('close')} testID="settings-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {deleting ? (
            <View>
              <Text style={{ color: th.ink, fontSize: 15, lineHeight: 22 }}>{t('dAcctWarning')}</Text>
              <TextInput testID="delete-phrase" style={input} value={phrase} onChangeText={setPhrase} placeholder={t('dAcctPhrase')} placeholderTextColor={th.muted2} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
              <TextInput testID="delete-password" style={input} value={pw} onChangeText={setPw} placeholder={t('dAcctPassword')} placeholderTextColor={th.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" editable={!busy} />
              {!!err && <Text testID="delete-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{t(REASON[err])}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable testID="delete-cancel" onPress={done} disabled={busy} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                <Pressable testID="delete-confirm" onPress={doDelete} disabled={busy || !pw || phrase.trim() !== DELETE_PHRASE} accessibilityRole="button" accessibilityState={{ disabled: busy || !pw || phrase.trim() !== DELETE_PHRASE }} style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: th.danger, alignItems: 'center', opacity: busy || !pw || phrase.trim() !== DELETE_PHRASE ? 0.45 : 1 }}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('dAcctConfirm')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              {label(t('account'))}
              <View style={{ backgroundColor: th.surface, borderRadius: 14, borderWidth: 1, borderColor: th.line, padding: 14 }}>
                <Text style={{ color: th.ink, fontSize: 16, fontWeight: '600' }}>{account?.display_name || account?.email || '—'}</Text>
                {!!account?.email && !!account?.display_name && <Text style={{ color: th.muted, fontSize: 13, marginTop: 2 }}>{account.email}</Text>}
                {!!account?.plan && <Text style={{ color: th.muted, fontSize: 13, marginTop: 6 }}>{t('planLabel')}: {account.plan}</Text>}
              </View>
              {label(t('language'))}
              {seg(s.lang, [{ v: 'id', label: 'Indonesia' }, { v: 'en', label: 'English' }], s.setLang)}
              {label('Theme')}
              {seg<ThemePref>(s.theme, [{ v: 'auto', label: t('themeAuto').replace(/^.*: /, '') }, { v: 'light', label: t('themeLight').replace(/^.*: /, '') }, { v: 'dark', label: t('themeDark').replace(/^.*: /, '') }], s.setTheme)}
              <Pressable testID="open-providers" onPress={() => setProviders(true)} accessibilityRole="button" style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('provManage')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 18 }}>{t('chatsOnDevice')}</Text>
              <Pressable testID="logout" onPress={confirmLogout} accessibilityRole="button" style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '700' }}>{t('logout')}</Text></Pressable>
              <Pressable testID="delete-account" onPress={() => setDeleting(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, alignItems: 'center' }}><Text style={{ color: th.danger, fontWeight: '600' }}>{t('dAcctBtn')}</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <ProvidersSheet visible={providers} onClose={() => setProviders(false)} />
    </Modal>
  )
}
