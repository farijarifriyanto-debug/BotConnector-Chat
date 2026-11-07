import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { langName } from '../i18n/langs'
import { legalUrl, type LegalPage } from '../lib/links'
import { SHOT, useShot } from '../lib/shot'
import { MEMORY_ID } from '../lib/conv'
import { useChat } from '../store/chat'
import { useLocal } from '../local/store'
import { useProviders } from '../store/providers'
import { useSearch } from '../store/search'
import { useSettings, type ThemePref } from '../store/settings'
import { useWorldBook } from '../store/worldbook'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { LanguageSheet } from './LanguageSheet'
import { LocalModelsSheet } from './LocalModelsSheet'
import { ModelCapsSheet } from './ModelCapsSheet'
import { PersonalizationSheet } from './PersonalizationSheet'
import { InstructionsSheet } from './InstructionsSheet'
import { WorldBookSheet } from './WorldBookSheet'
import { ToolDescriptionsSheet } from './ToolDescriptionsSheet'
import { ProvidersSheet } from './ProvidersSheet'
import { SearchSheet } from './SearchSheet'
import { QuickPhrasesSheet } from './QuickPhrasesSheet'
import { StatsSheet } from './StatsSheet'
import { ProjectsSheet } from './ProjectsSheet'
import { BackupSheet } from './BackupSheet'
import { TranslateSettingsSheet } from './TranslateSettingsSheet'

const VERSION: string = (require('../../app.json') as { expo: { version: string } }).expo.version

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
/** Search provider label on the row: the honest default name or the chosen BYOK one. */
const SEARCH_NAME: Record<string, string> = { brave: 'Brave', tavily: 'Tavily', exa: 'Exa', parallel: 'Parallel' }

/** Settings, grouped the Kelivo way (General / Models & Services / Data / About) with a filter box and the current value on every row. No account surface: the app is standalone. */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), s = useSettings()
  const providers = useProviders(x => x.providers), localCount = useLocal(x => x.models.length), searchProvider = useSearch(x => x.provider)
  const books = useWorldBook(x => x.books), memoryCount = useChat(x => x.convs.find(c => c.id === MEMORY_ID)?.memory?.length ?? 0)
  const [providersOpen, setProvidersOpen] = useState(false), [local, setLocal] = useState(false), [personal, setPersonal] = useState(false), [langOpen, setLangOpen] = useState(false), [search, setSearch] = useState(false), [instr, setInstr] = useState(false), [lore, setLore] = useState(false), [tools, setTools] = useState(false), [quickPhrases, setQuickPhrases] = useState(false), [stats, setStats] = useState(false), [projects, setProjects] = useState(false), [backup, setBackup] = useState(false), [trSettings, setTrSettings] = useState(false), [caps, setCaps] = useState(false)
  const [q, setQ] = useState('')
  const scene = useShot(x => x.scene)
  useEffect(() => { if (SHOT) { setLangOpen(scene === 'language'); setSearch(scene === 'search'); setPersonal(scene === 'personal'); setBackup(scene === 'backup' || scene === 'backup-remote') } }, [scene])   // screenshot build only
  const open = (page: LegalPage) => { void Linking.openURL(legalUrl(page, s.lang)).catch(() => {}) }

  const seg = <T extends string | number>(value: T, items: { v: T; label: string }[], set: (v: T) => void) => (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
      {items.map(i => <Pressable key={i.v} testID={`seg-${i.v}`} accessibilityRole="button" accessibilityState={{ selected: value === i.v }} onPress={() => set(i.v)} style={{ flex: 1, paddingVertical: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: value === i.v ? th.accentSoft : th.surface }}><Text style={{ color: value === i.v ? th.accentStrong : th.ink, fontWeight: '600', fontSize: 14 }}>{i.label}</Text></Pressable>)}
    </View>)
  const row = (id: string, title: string, value: string | null, onPress: () => void, note?: string) => (
    <Pressable key={id} testID={id} onPress={onPress} accessibilityRole="button" style={{ minHeight: 48, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600' }}>{title}</Text>{note ? <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{note}</Text> : null}</View>
      {value !== null && <Text testID={`val-${id.replace(/^open-/, '')}`} numberOfLines={1} style={{ color: th.muted, fontSize: 13, maxWidth: '40%' }}>{value}</Text>}
      <Icon name="ChevR" size={16} color={th.muted} />
    </Pressable>)
  const segRow = (id: string, title: string, node: React.ReactNode) => (
    <View key={id} testID={id} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, marginBottom: 8 }}>
      <Text style={{ color: th.ink, fontWeight: '600' }}>{title}</Text>
      {node}
    </View>)

  const groups: { title: string; items: { kw: string; node: React.ReactNode }[] }[] = [
    { title: t('setGroupGeneral'), items: [
      { kw: 'language bahasa', node: row('open-language', t('language'), langName(s.lang), () => setLangOpen(true)) },
      { kw: 'theme tema dark light gelap terang auto', node: segRow('row-theme', t('theme'), seg<ThemePref>(s.theme, [{ v: 'auto', label: cap(t('themeAuto').replace(/^.*: /, '')) }, { v: 'light', label: cap(t('themeLight').replace(/^.*: /, '')) }, { v: 'dark', label: cap(t('themeDark').replace(/^.*: /, '')) }], s.setTheme)) },
      { kw: 'text size font ukuran teks huruf', node: segRow('row-fontscale', t('fsTitle'), seg<number>(s.fontScale, [{ v: 0.9, label: t('fsSmall') }, { v: 1, label: t('fsNormal') }, { v: 1.15, label: t('fsLarge') }, { v: 1.3, label: t('fsXL') }], s.setFontScale)) },
      { kw: 'metadata message pesan time waktu', node: segRow('row-msgmeta', t('msgMeta'), seg<'on' | 'off'>(s.msgMeta ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setMsgMeta(v === 'on'))) },
    ] },
    { title: t('setGroupModels'), items: [
      { kw: 'providers penyedia qr api key openai gemini openrouter model connect sambung', node: row('open-providers', t('provTitle'), t('setProvidersN', { n: providers.length }), () => setProvidersOpen(true)) },
      { kw: 'local lokal on-device perangkat gguf download unduh model', node: row('open-local', t('locManage'), t('setLocalN', { n: localCount }), () => setLocal(true)) },
      { kw: 'capabilities kemampuan tools visi vision reasoning', node: row('open-caps', t('capsTitle'), null, () => setCaps(true), t('capsTools') + ' · ' + t('capsVision') + ' · ' + t('capsReasoning')) },
      { kw: 'search pencarian web brave tavily exa parallel reader membaca halaman', node: row('open-search', t('srchTitle'), SEARCH_NAME[searchProvider] ?? searchProvider, () => setSearch(true)) },
      { kw: 'translate terjemahan translation', node: row('open-translate-settings', t('trModelLabel'), null, () => setTrSettings(true)) },
      { kw: 'tools deskripsi description', node: row('open-tools', t('toolTitle'), null, () => setTools(true)) },
      { kw: 'memory memori tools', node: segRow('row-toolsmem', t('toolsMemTitle'), seg<'on' | 'off'>(s.toolsMemory ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsMemory(v === 'on'))) },
      { kw: 'device perangkat tools clipboard time waktu', node: segRow('row-toolsdev', t('toolsDevTitle'), seg<'on' | 'off'>(s.toolsDevice ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsDevice(v === 'on'))) },
      { kw: 'recall chat search cari tools', node: segRow('row-toolsrecall', t('toolsRecallTitle'), seg<'on' | 'off'>(s.toolsRecall ? 'on' : 'off', [{ v: 'on', label: t('msgMetaOn') }, { v: 'off', label: t('msgMetaOff') }], v => s.setToolsRecall(v === 'on'))) },
    ] },
    { title: t('setGroupData'), items: [
      { kw: 'personalization personalisasi memory memori', node: row('open-personal', t('personalization'), memoryCount ? t('setMemoryN', { n: memoryCount }) : null, () => setPersonal(true)) },
      { kw: 'instructions instruksi assistant asisten', node: row('open-instructions', t('instrTitle'), null, () => setInstr(true)) },
      { kw: 'world book lore', node: row('open-worldbook', t('loreTitle'), books.length ? t('setBooksN', { n: books.length }) : null, () => setLore(true)) },
      { kw: 'quick phrases frasa cepat', node: row('open-quick-phrases', t('qpTitle'), null, () => setQuickPhrases(true)) },
      { kw: 'statistics statistik heatmap', node: row('open-stats', t('statTitle'), null, () => setStats(true)) },
      { kw: 'projects proyek', node: row('open-projects', t('projTitle'), null, () => setProjects(true)) },
      { kw: 'backup cadangan restore pulihkan webdav', node: row('open-backup', t('bkTitle'), null, () => setBackup(true)) },
    ] },
    { title: t('setGroupAbout'), items: [
      { kw: 'privacy privasi', node: row('legal-privacy', t('legalPrivacy'), null, () => open('privacy')) },
      { kw: 'terms syarat ketentuan', node: row('legal-terms', t('legalTerms'), null, () => open('terms')) },
      { kw: 'support bantuan dukungan', node: row('legal-support', t('legalSupport'), null, () => open('support')) },
      { kw: 'version versi', node: (
        <View key="version" testID="settings-version" style={{ minHeight: 48, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('setVersion')}</Text></View>
          <Text style={{ color: th.muted, fontSize: 13 }}>{VERSION}</Text>
        </View>) },
    ] },
  ]
  const query = q.trim().toLowerCase()
  const shown = groups.map(g => ({ ...g, items: g.items.filter(i => !query || i.kw.includes(query)) })).filter(g => g.items.length)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('settings')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="settings-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <View style={{ marginHorizontal: 16, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: th.surface, borderWidth: 1, borderColor: th.line, borderRadius: 12, paddingHorizontal: 12 }}>
          <Icon name="Search" size={17} color={th.muted} />
          <TextInput testID="settings-search" value={q} onChangeText={setQ} placeholder={t('setSearchPh')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingVertical: 11, color: th.ink, fontSize: 15 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {shown.map(g => (
            <View key={g.title}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8, marginLeft: 4 }}>{g.title}</Text>
              {g.items.map(i => i.node)}
            </View>))}
          {!!query && !shown.length && <Text testID="settings-no-results" style={{ color: th.muted, textAlign: 'center', marginTop: 30 }}>{t('setNoResults', { q: query })}</Text>}
          <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 18 }}>{t('chatsOnDevice')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <SearchSheet visible={search} onClose={() => setSearch(false)} />
      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
      <PersonalizationSheet visible={personal} onClose={() => setPersonal(false)} />
      <InstructionsSheet visible={instr} onClose={() => setInstr(false)} />
      <WorldBookSheet visible={lore} onClose={() => setLore(false)} />
      <ToolDescriptionsSheet visible={tools} onClose={() => setTools(false)} />
      <QuickPhrasesSheet visible={quickPhrases} onClose={() => setQuickPhrases(false)} />
      <StatsSheet visible={stats} onClose={() => setStats(false)} />
      <ProjectsSheet visible={projects} onClose={() => setProjects(false)} />
      <BackupSheet visible={backup} onClose={() => setBackup(false)} />
      <TranslateSettingsSheet visible={trSettings} onClose={() => setTrSettings(false)} />
      <ProvidersSheet visible={providersOpen} onClose={() => setProvidersOpen(false)} />
      <ModelCapsSheet visible={caps} onClose={() => setCaps(false)} />
      <LocalModelsSheet visible={local} onClose={() => setLocal(false)} onUsed={onClose} />
    </Modal>
  )
}
