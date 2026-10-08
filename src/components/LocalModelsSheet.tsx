import * as Device from 'expo-device'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { RECOMMENDED } from '../local/catalog'
import { listFiles, parseSource, searchRepos, type HfFile, type HfRepo } from '../local/hf'
import { useLocalParams } from '../local/params'
import { useLocal, localId, type Download } from '../local/store'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

export const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`)
/** 'ok' when the file is a comfortable fit for this phone's RAM, 'tight' when iOS may close the app. */
export const fit = (bytes: number, ram: number | null): 'ok' | 'tight' => (ram && bytes > ram * 0.4 ? 'tight' : 'ok')
const DL_ERR = { space: 'locSpace', network: 'locNet', gated: 'locGated', failed: 'locFail' } as const

export function LocalModelsSheet({ visible, onClose, onUsed }: { visible: boolean; onClose: () => void; onUsed?: () => void }) {
  const th = useTheme(), t = useT()
  const { models, downloads, hfToken } = useLocal(), params = useLocalParams(s => s.params), setParams = useLocalParams(s => s.set)
  const [query, setQuery] = useState(''), [repos, setRepos] = useState<HfRepo[] | null>(null), [files, setFiles] = useState<{ repo: string; list: HfFile[] } | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [tok, setTok] = useState(''), [tab, setTab] = useState<'rec' | 'inst' | 'all'>('rec'), [fq, setFq] = useState('')
  const ram = Device.totalMemory ?? null
  useEffect(() => { if (visible) void useLocal.getState().loadToken() }, [visible])
  useEffect(() => { setTok(hfToken) }, [hfToken])

  const search = async () => {
    setBusy(true); setErr(null); setFiles(null); setRepos(null)
    try {
      const src = parseSource(query)
      if (src) { const list = await listFiles(src.repo, hfToken); if (src.file) { const f = list.find(x => x.path === src.file); if (f) { void useLocal.getState().download({ repo: src.repo, file: f.path, bytes: f.bytes }); setBusy(false); return } } setFiles({ repo: src.repo, list }) }
      else if (query.trim()) setRepos(await searchRepos(query, hfToken))
    } catch (e) { setErr((e as Error).message === 'gated' ? 'locGated' : 'locSearchFail') }
    setBusy(false)
  }
  const openRepo = async (repo: string) => { setBusy(true); setErr(null); try { setFiles({ repo, list: await listFiles(repo, hfToken) }) } catch (e) { setErr((e as Error).message === 'gated' ? 'locGated' : 'locSearchFail') } setBusy(false) }
  const use = (id: string) => { useChat.getState().selectModel(id); onClose(); onUsed?.() }
  const remove = (id: string, name: string) => Alert.alert(name, t('locDeleteQ'), [{ text: t('cancel'), style: 'cancel' }, { text: t('locDelete'), style: 'destructive', onPress: () => { void useLocal.getState().remove(id).then(() => useChat.getState().syncCustom()) } }])
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const card = { padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface } as const
  const btn = (on: boolean) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: on ? th.accent : th.surface3 })
  const seg = <T extends number>(value: T, items: T[], set: (v: T) => void, fmt: (v: T) => string = String) => (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, overflow: 'hidden' }}>
      {items.map(i => <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: value === i }} onPress={() => set(i)} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: value === i ? th.accentSoft : th.surface }}><Text style={{ color: value === i ? th.accentStrong : th.ink, fontWeight: '600', fontSize: 13 }}>{fmt(i)}</Text></Pressable>)}
    </View>)
  const dlRow = (id: string, d: Download, name: string) => (
    <View key={id} style={card}>
      <Text style={{ color: th.ink, fontWeight: '600' }}>{name}</Text>
      {d.error ? <Text style={{ color: th.danger, fontSize: 13, marginTop: 4 }}>{t(DL_ERR[d.error])}</Text> : (
        <View style={{ marginTop: 8 }}><View style={{ height: 6, borderRadius: 3, backgroundColor: th.surface3 }}><View style={{ height: 6, borderRadius: 3, width: `${d.total ? Math.min(100, (d.received / d.total) * 100) : 0}%`, backgroundColor: th.accent }} /></View>
          <Text style={{ color: th.muted, fontSize: 12, marginTop: 4 }}>{fmtBytes(d.received)} / {fmtBytes(d.total)}</Text></View>)}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 6 }}>
        {!!d.error && <Pressable testID={`dl-retry-${id}`} onPress={() => void useLocal.getState().retry(id)} accessibilityRole="button" hitSlop={8}><Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('locRetry')}</Text></Pressable>}
        <Pressable testID={`dl-cancel-${id}`} onPress={() => void useLocal.getState().cancel(id)} accessibilityRole="button" hitSlop={8}><Text style={{ color: th.muted, fontWeight: '600' }}>{t('locCancel')}</Text></Pressable>
      </View>
    </View>)
  const getBtn = (repo: string, file: string, bytes: number, name?: string) => {
    const id = localId(file.split('/').pop() ?? file); const have = models.some(m => m.id === id), busyDl = !!downloads[id] && !downloads[id].error
    return have ? <Icon name="Check" size={20} color={th.accentStrong} /> : <Pressable testID={`get-${id}`} disabled={busyDl} onPress={() => void useLocal.getState().download({ repo, file, bytes, name })} accessibilityRole="button" style={[btn(true), { opacity: busyDl ? 0.5 : 1 }]}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('locDownload')}</Text></Pressable>
  }
  const perf = (bytes: number) => t(bytes <= 1.0e9 ? 'locFast' : bytes <= 2.2e9 ? 'locBalanced' : 'locQuality')
  const ramNote = (bytes: number) => t('locRamEst', { gb: ((bytes * 1.25) / 1e9).toFixed(1) })   // a rough estimate: file size plus working memory
  const match = (name: string) => !fq.trim() || name.toLowerCase().includes(fq.trim().toLowerCase())
  const warn = (bytes: number) => fit(bytes, ram) === 'tight' && <Text style={{ color: th.danger, fontSize: 12, marginTop: 3 }}>{t('locMemWarn')}</Text>

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('locTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="local-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('locIntro')}</Text>

          {Object.keys(downloads).length > 0 && <>{label(t('locDownloads'))}{Object.entries(downloads).map(([id, d]) => dlRow(id, d, id.replace(/^local:/, '').replace(/\.gguf$/i, '')))}</>}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {([['rec', 'lfRec'], ['inst', 'lfInst'], ['all', 'lfAll']] as const).map(([id, k]) => { const on = tab === id; return (
              <Pressable key={id} testID={`loc-tab-${id}`} onPress={() => setTab(id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ height: 32, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface }}><Text style={{ color: on ? th.accentStrong : th.ink, fontSize: 13, fontWeight: '600' }}>{t(k)}{id === 'inst' && models.length ? ` (${models.length})` : ''}</Text></Pressable>) })}
          </View>
          <TextInput testID="loc-filter" value={fq} onChangeText={setFq} placeholder={t('modelSearch')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} style={{ marginTop: 10, borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: th.ink, backgroundColor: th.surface, fontSize: 15 }} />

          {(tab === 'inst' || tab === 'all') && <>
            {tab === 'all' && label(t('locInstalled'))}
            {models.length === 0 && <Text testID="loc-none" style={{ color: th.muted, marginTop: 12 }}>{t('locNone')}</Text>}
            {models.filter(m => match(m.name)).map(m => (
              <View key={m.id} testID={`installed-${m.id}`} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }]}>
                <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600' }}>{m.name}</Text><Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{fmtBytes(m.bytes)} · {perf(m.bytes)}</Text></View>
                <Pressable testID={`use-${m.id}`} onPress={() => use(m.id)} accessibilityRole="button" style={btn(true)}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('locUse')}</Text></Pressable>
                <Pressable onPress={() => remove(m.id, m.name)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('locDelete')} testID={`del-${m.id}`}><Icon name="Trash" size={20} color={th.danger} /></Pressable>
              </View>))}
          </>}

          {(tab === 'rec' || tab === 'all') && <>
            {tab === 'all' && label(t('locRecommended'))}
            {RECOMMENDED.filter(r => match(r.name)).map(r => (
              <View key={r.file} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }]}>
                <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600' }}>{r.name}</Text><Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{fmtBytes(r.bytes)} · {perf(r.bytes)}</Text><Text style={{ color: th.muted2, fontSize: 11.5, marginTop: 1 }}>{ramNote(r.bytes)}</Text>{warn(r.bytes)}</View>
                {getBtn(r.repo, r.file, r.bytes, r.name)}
              </View>))}
          </>}

          {tab === 'all' && <>
          {label(t('locSearch'))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput testID="hf-query" value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder={t('locSearchHint')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
            <Pressable testID="hf-go" onPress={search} disabled={busy} accessibilityRole="button" accessibilityLabel={t('search')} style={[btn(true), { justifyContent: 'center' }]}>{busy ? <ActivityIndicator color={th.accentInk} /> : <Icon name="Search" size={18} color={th.accentInk} />}</Pressable>
          </View>
          {!!err && <Text accessibilityRole="alert" style={{ color: th.danger, marginTop: 8 }}>{t(err as 'locGated')}</Text>}
          {files ? (
            <View style={{ marginTop: 10 }}>
              <Pressable onPress={() => setFiles(null)} accessibilityRole="button"><Text style={{ color: th.accentStrong, fontWeight: '600', marginBottom: 6 }}>‹ {t('locBack')} · {files.repo}</Text></Pressable>
              {files.list.length === 0 && <Text style={{ color: th.muted }}>{t('locNoFiles')}</Text>}
              {files.list.map(f => <View key={f.path} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}><View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={2}>{f.path}</Text><Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{fmtBytes(f.bytes)}{f.quant ? ` · ${f.quant}` : ''}</Text>{warn(f.bytes)}</View>{getBtn(files.repo, f.path, f.bytes)}</View>)}
            </View>
          ) : repos ? (
            <View style={{ marginTop: 10 }}>
              {repos.map(r => <Pressable key={r.id} testID={`repo-${r.id}`} onPress={() => void openRepo(r.id)} accessibilityRole="button" style={card}><Text style={{ color: th.ink, fontWeight: '600' }}>{r.id}</Text><Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{t('locResultCount', { n: r.downloads.toLocaleString() })}</Text></Pressable>)}
            </View>
          ) : null}

          </>}

          {label(t('locToken'))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput testID="hf-token" value={tok} onChangeText={setTok} placeholder="hf_…" placeholderTextColor={th.muted2} secureTextEntry autoCapitalize="none" autoCorrect={false} style={{ flex: 1, borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
            <Pressable onPress={() => void useLocal.getState().setToken(tok)} accessibilityRole="button" style={[btn(true), { justifyContent: 'center' }]}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('locTokenSave')}</Text></Pressable>
          </View>
          <Text style={{ color: th.muted, fontSize: 12, marginTop: 6 }}>{t('locTokenNote')}</Text>

          {label(t('locSettings'))}
          <Text style={{ color: th.ink, fontWeight: '600', marginBottom: 6 }}>{t('locCtx')}</Text>
          {seg(params.nCtx, [2048, 4096, 8192], v => setParams({ nCtx: v }))}
          <Text style={{ color: th.ink, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>{t('locPredict')}</Text>
          {seg(params.nPredict, [512, 1024, 2048, 4096], v => setParams({ nPredict: v }))}
          <Text style={{ color: th.ink, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>{t('locTemp')}</Text>
          {seg(params.temperature, [0.2, 0.5, 0.7, 1], v => setParams({ temperature: v }), v => v.toFixed(1))}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}><Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('locGpu')}</Text><Switch testID="sw-gpu" value={params.gpu} onValueChange={v => setParams({ gpu: v })} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}><Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('locThink')}</Text><Switch testID="sw-think" value={params.thinking} onValueChange={v => setParams({ thinking: v })} /></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
