import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { langName } from '../i18n/langs'
import { legalUrl, type LegalPage } from '../lib/links'
import { SHOT, useShot } from '../lib/shot'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useSettings, type ThemePref } from '../store/settings'
import { useTheme } from '../theme/theme'
import type { DeleteFailure } from '../auth/session'
import { AppleButton } from './AppleButton'
import { Icon } from './Icons'
import { LanguageSheet } from './LanguageSheet'
import { LaptopSheet } from './LaptopSheet'
import { LocalModelsSheet } from './LocalModelsSheet'
import { PersonalizationSheet } from './PersonalizationSheet'
import { InstructionsSheet } from './InstructionsSheet'
import { WorldBookSheet } from './WorldBookSheet'
import { ToolDescriptionsSheet } from './ToolDescriptionsSheet'
import { ProvidersSheet } from './ProvidersSheet'
import { SearchSheet } from './SearchSheet'
import { QuickPhrasesSheet } from './QuickPhrasesSheet'
import { StatsSheet } from './StatsSheet'
import { ProjectsSheet } from './ProjectsSheet'
import { SyncSection } from './SyncSection'
import { UsageSheet } from './UsageSheet'

export const DELETE_PHRASE = 'HAPUS AKUN'   // the server accepts only this exact phrase, whatever the app language is
const REASON = { wrong_password: 'dAcctWrong', confirmation: 'dAcctBadPhrase', rate_limited: 'dAcctRate', session: 'dAcctSession', unavailable: 'dAcctDown', network: 'dAcctNet', apple_mismatch: 'dAcctAppleMismatch', reauth: 'dAcctReauthFailed', reauth_other: 'dAcctReauthOther' } as const
type DeleteError = DeleteFailure | 'apple_mismatch'

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), s = useSettings(), account = useAuth(a => a.account), guest = useAuth(a => a.status === 'guest')
  const apple = useAuth(a => a.apple), appleLinked = useAuth(a => a.appleLinked), [linkMsg, setLinkMsg] = useState<string | null>(null)
  const [providers, setProviders] = useState(false), [local, setLocal] = useState(false), [personal, setPersonal] = useState(false), [laptop, setLaptop] = useState(false), [langOpen, setLangOpen] = useState(false), [usage, setUsage] = useState(false), [search, setSearch] = useState(false), [instr, setInstr] = useState(false), [lore, setLore] = useState(false), [tools, setTools] = useState(false), [quickPhrases, setQuickPhrases] = useState(false), [stats, setStats] = useState(false), [projects, setProjects] = useState(false), [deleting, setDeleting] = useState(false), [pw, setPw] = useState(''), [phrase, setPhrase] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<DeleteError | null>(null)
  const viaApple = appleLinked === true   // Apple HIG: an Apple account is never asked for a password; Apple confirms it is the owner
  const canDelete = !busy && phrase.trim() === DELETE_PHRASE && (viaApple || !!pw)
  const scene = useShot(x => x.scene)
  useEffect(() => { if (SHOT) { setLangOpen(scene === 'language'); setSearch(scene === 'search'); setPersonal(scene === 'personal') } }, [scene])   // screenshot build only
  const open = (page: LegalPage) => { void Linking.openURL(legalUrl(page, s.lang)).catch(() => {}) }
  const done = () => { setDeleting(false); setPw(''); setPhrase(''); setErr(null); setBusy(false) }
  const close = () => { if (!busy) { done(); onClose() } }
  const confirmLogout = () => Alert.alert(t('logout'), t('logoutConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('logout'), style: 'destructive', onPress: () => { onClose(); useChat.getState().reset(); void useAuth.getState().logout() } }])
  const doDelete = async () => {
    setBusy(true); setErr(null)
    const r = viaApple ? await useAuth.getState().deleteAccountWithApple(phrase.trim()) : await useAuth.getState().deleteAccount(pw, phrase.trim())
    if (r.ok || r.reason === 'session') { useChat.getState().reset(); done(); onClose(); return }
    setBusy(false); setErr(r.reason === 'cancelled' ? null : r.reason)
  }
  const deleteByLogin = async () => {
    setBusy(true); setErr(null)
    const r = await useAuth.getState().deleteAccountByLogin(phrase.trim())
    if (r.ok || r.reason === 'session') { useChat.getState().reset(); done(); onClose(); return }
    setBusy(false); setErr(r.reason === 'cancelled' ? null : r.reason)
  }
  const link = async () => {
    setLinkMsg(null)
    const e = await useAuth.getState().linkApple()
    setLinkMsg(e === 'ok' ? 'appleLinked' : e === 'apple_taken' ? 'appleLinkTaken' : e === null ? null : 'appleErrFailed')
  }
  const seg = <T extends string | number>(value: T, items: { v: T; label: string }[], set: (v: T) => void) => (
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
              {viaApple
                ? <Text testID="delete-apple-note" style={{ color: th.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 }}>{t('dAcctAppleNote')}</Text>
                : <TextInput testID="delete-password" style={input} value={pw} onChangeText={setPw} placeholder={t('dAcctPassword')} placeholderTextColor={th.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" editable={!busy} />}
              {!!err && <Text testID="delete-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{t(REASON[err])}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable testID="delete-cancel" onPress={done} disabled={busy} accessibilityRole="button" style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                <Pressable testID="delete-confirm" onPress={doDelete} disabled={!canDelete} accessibilityRole="button" accessibilityState={{ disabled: !canDelete }} style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: th.danger, alignItems: 'center', opacity: canDelete ? 1 : 0.45 }}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t(viaApple ? 'dAcctApple' : 'dAcctConfirm')}</Text>}
                </Pressable>
              </View>
              {!viaApple && <View style={{ marginTop: 18 }}>
                <Text style={{ color: th.muted, fontSize: 13.5, lineHeight: 20 }}>{t('dAcctReauthNote')}</Text>
                <Pressable testID="delete-reauth" onPress={deleteByLogin} disabled={busy || phrase.trim() !== DELETE_PHRASE} accessibilityRole="button" accessibilityState={{ disabled: busy || phrase.trim() !== DELETE_PHRASE }}
                  style={{ marginTop: 10, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.danger, alignItems: 'center', opacity: busy || phrase.trim() !== DELETE_PHRASE ? 0.45 : 1 }}>
                  <Text style={{ color: th.danger, fontWeight: '700' }}>{t('dAcctReauth')}</Text>
                </Pressable>
              </View>}
            </View>
          ) : (
            <View>
              {label(t('account'))}
              <View style={{ backgroundColor: th.surface, borderRadius: 14, borderWidth: 1, borderColor: th.line, padding: 14 }}>
                {guest ? (<>
                  <Text style={{ color: th.ink, fontSize: 15, lineHeight: 21 }}>{t('guestMode')}</Text>
                  <Pressable testID="guest-signin" onPress={() => { onClose(); void useAuth.getState().login() }} accessibilityRole="button" style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: th.accent, alignItems: 'center' }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('guestSignIn')}</Text></Pressable>
                  <View style={{ marginTop: 10 }}><AppleButton testID="guest-apple-signin" height={44} radius={10} onPress={() => { onClose(); void useAuth.getState().loginWithApple() }} /></View>
                </>) : (<>
                  <Text style={{ color: th.ink, fontSize: 16, fontWeight: '600' }}>{account?.display_name || account?.email || t('acctDefault')}</Text>
                  {!!account?.email && !!account?.display_name && <Text style={{ color: th.muted, fontSize: 13, marginTop: 2 }}>{account.email}</Text>}
                  {viaApple && <Text testID="apple-using" style={{ color: th.muted, fontSize: 13, marginTop: 2 }}>{t('appleUsing')}</Text>}
                  {!!account?.plan && <Text style={{ color: th.muted, fontSize: 13, marginTop: 6 }}>{t('planLabel')}: {account.plan}</Text>}
                  {apple && appleLinked === false && <View style={{ marginTop: 12 }}>
                    <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19, marginBottom: 8 }}>{t('appleLinkNote')}</Text>
                    <AppleButton testID="apple-link" type="CONTINUE" height={44} radius={10} onPress={() => void link()} />
                  </View>}
                  {!!linkMsg && <Text testID="apple-link-msg" accessibilityRole="alert" style={{ color: linkMsg === 'appleLinked' ? th.accentStrong : th.danger, fontSize: 13, marginTop: 8 }}>{t(linkMsg as never)}</Text>}
                  <Pressable testID="open-usage" onPress={() => setUsage(true)} accessibilityRole="button" style={{ marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('usageTitle')}</Text><Icon name="ChevR" size={16} color={th.muted} /></Pressable>
                </>)}
              </View>
              {label(t('language'))}
              <Pressable testID="open-language" onPress={() => setLangOpen(true)} accessibilityRole="button" style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{langName(s.lang)}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              {label(t('theme'))}
              {seg<ThemePref>(s.theme, [{ v: 'auto', label: cap(t('themeAuto').replace(/^.*: /, '')) }, { v: 'light', label: cap(t('themeLight').replace(/^.*: /, '')) }, { v: 'dark', label: cap(t('themeDark').replace(/^.*: /, '')) }], s.setTheme)}
              {label(t('fsTitle'))}
              {seg<number>(s.fontScale, [{ v: 0.9, label: t('fsSmall') }, { v: 1, label: t('fsNormal') }, { v: 1.15, label: t('fsLarge') }, { v: 1.3, label: t('fsXL') }], s.setFontScale)}
              {label(t('msgMeta'))}
              {seg<'on' | 'off'>(s.msgMeta ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setMsgMeta(v === 'on'))}
              <Pressable testID="open-personal" onPress={() => setPersonal(true)} accessibilityRole="button" style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('personalization')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-instructions" onPress={() => setInstr(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('instrTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-worldbook" onPress={() => setLore(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('loreTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-tools" onPress={() => setTools(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('toolTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-quick-phrases" onPress={() => setQuickPhrases(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('qpTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-stats" onPress={() => setStats(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('statTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-projects" onPress={() => setProjects(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('projTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              {label(t('toolsMemTitle'))}
              {seg<'on' | 'off'>(s.toolsMemory ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsMemory(v === 'on'))}
              {label(t('toolsDevTitle'))}
              {seg<'on' | 'off'>(s.toolsDevice ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsDevice(v === 'on'))}
              {label(t('toolsRecallTitle'))}
              {seg<'on' | 'off'>(s.toolsRecall ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsRecall(v === 'on'))}
              <Pressable testID="open-search" onPress={() => setSearch(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('srchTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              <Pressable testID="open-providers" onPress={() => setProviders(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('provTitle')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              {!guest && <Pressable testID="open-laptop" onPress={() => setLaptop(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('laptop')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>}
              <Pressable testID="open-local" onPress={() => setLocal(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('locManage')}</Text><Icon name="Chevron" size={16} color={th.muted} /></Pressable>
              {!guest && <SyncSection />}
              {label(t('legalTitle'))}
              {(['privacy', 'terms', 'support'] as const).map(pg => (
                <Pressable key={pg} testID={`legal-${pg}`} onPress={() => open(pg)} accessibilityRole="link" style={{ marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: th.ink, fontWeight: '600' }}>{t(pg === 'privacy' ? 'legalPrivacy' : pg === 'terms' ? 'legalTerms' : 'legalSupport')}</Text><Icon name="ChevR" size={16} color={th.muted} />
                </Pressable>))}
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 18 }}>{t('chatsOnDevice')}</Text>
              {!guest && <Pressable testID="logout" onPress={confirmLogout} accessibilityRole="button" style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontWeight: '700' }}>{t('logout')}</Text></Pressable>}
              {!guest && <Pressable testID="delete-account" onPress={() => setDeleting(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, alignItems: 'center' }}><Text style={{ color: th.danger, fontWeight: '600' }}>{t('dAcctBtn')}</Text></Pressable>}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <SearchSheet visible={search} onClose={() => setSearch(false)} />
      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
      {!guest && <UsageSheet visible={usage} onClose={() => setUsage(false)} />}
      <LaptopSheet visible={laptop} onClose={() => setLaptop(false)} onUsed={onClose} />
      <PersonalizationSheet visible={personal} onClose={() => setPersonal(false)} />
      <InstructionsSheet visible={instr} onClose={() => setInstr(false)} />
      <WorldBookSheet visible={lore} onClose={() => setLore(false)} />
      <ToolDescriptionsSheet visible={tools} onClose={() => setTools(false)} />
      <QuickPhrasesSheet visible={quickPhrases} onClose={() => setQuickPhrases(false)} />
      <StatsSheet visible={stats} onClose={() => setStats(false)} />
      <ProjectsSheet visible={projects} onClose={() => setProjects(false)} />
      <ProvidersSheet visible={providers} onClose={() => setProviders(false)} />
      <LocalModelsSheet visible={local} onClose={() => setLocal(false)} onUsed={onClose} />
    </Modal>
  )
}
