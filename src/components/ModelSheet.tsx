import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { filterModels, imageAsModel, type ModelFilter } from '../lib/modelPicker'
import type { ImageModel } from '../api/api'
import type { Access, ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const GROUPS: { access: Access; key: 'groupAuto' | 'groupFree' | 'groupPlan' | 'groupFamily' | 'groupPayg' | 'groupLocal' }[] = [
  { access: 'auto', key: 'groupAuto' }, { access: 'free', key: 'groupFree' }, { access: 'plan', key: 'groupPlan' }, { access: 'family', key: 'groupFamily' }, { access: 'payg', key: 'groupPayg' }, { access: 'local', key: 'groupLocal' },
]
const BADGE = { free: 'accFree', plan: 'accPlan', family: 'accFamily', payg: 'accPayg', auto: 'accAuto', custom: 'accCustom', local: 'accLocal', laptop: 'accLaptop' } as const
const CHIPS: { id: ModelFilter; key: 'fAll' | 'fFree' | 'fCloud' | 'fLocal' | 'fImage' }[] = [{ id: 'all', key: 'fAll' }, { id: 'free', key: 'fFree' }, { id: 'cloud', key: 'fCloud' }, { id: 'local', key: 'fLocal' }, { id: 'image', key: 'fImage' }]

interface Props {
  visible: boolean; models: ChatModel[]; selected: string; onSelect: (id: string) => void; onClose: () => void
  /** picture models: shown under the Image filter (and in "All"); picking one calls onSelectImage */
  imageModels?: ImageModel[]; selectedImage?: string; onSelectImage?: (id: string) => void
  state?: 'idle' | 'loading' | 'ready' | 'error' | 'auth'; onRetry?: () => void
}

export function ModelSheet({ visible, models, selected, onSelect, onClose, imageModels = [], selectedImage = '', onSelectImage, state = 'ready', onRetry }: Props) {
  const th = useTheme(), t = useT()
  const [filter, setFilter] = useState<ModelFilter>('all'), [query, setQuery] = useState('')
  const all = useMemo(() => [...models, ...(onSelectImage ? imageModels.map(imageAsModel) : [])], [models, imageModels, onSelectImage])
  const shown = useMemo(() => filterModels(all, filter, query), [all, filter, query])
  const count = (f: ModelFilter) => filterModels(all, f, '').length
  const groups = useMemo(() => {
    const chat = shown.filter(m => !m.image)
    return [
      ...GROUPS.map(g => ({ id: g.access as string, title: t(g.key), list: chat.filter(m => m.access === g.access) })),
      ...[...new Set(chat.filter(m => m.access === 'custom').map(m => m.provider ?? ''))].map(pn => ({ id: 'custom:' + pn, title: pn, list: chat.filter(m => m.access === 'custom' && (m.provider ?? '') === pn) })),
      ...[...new Set(chat.filter(m => m.access === 'laptop').map(m => m.provider ?? ''))].map(pn => ({ id: 'laptop:' + pn, title: `${t('laptop')} · ${pn}`, list: chat.filter(m => m.access === 'laptop' && (m.provider ?? '') === pn) })),
      { id: 'image', title: t('fImage'), list: shown.filter(m => m.image) },
    ].filter(g => g.list.length)
  }, [shown, t])
  const close = () => { setQuery(''); setFilter('all'); onClose() }
  const pick = (m: ChatModel) => { if (m.image) onSelectImage?.(m.id); else onSelect(m.id); close() }
  const detail = (m: ChatModel) => !m.available ? t(m.reason === 'no_payg_balance' ? 'needBalance' : 'notAvailable')
    : [m.context ? t('ctx', { n: Math.round(m.context / 1000) }) : '', m.vision ? t('vision') : '', m.tools ? t('tools') : '', m.reasoning ? t('reasoning') : '', m.image && m.refs ? t('imgRefBadge') : ''].filter(Boolean).join(' · ')
  const badgeColor = (a: Access) => (a === 'free' ? [th.free, th.freeBg] : a === 'plan' || a === 'family' ? [th.plan, th.planBg] : a === 'payg' ? [th.payg, th.paygBg] : [th.muted, th.surface3])
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('model')}</Text>
          <Pressable onPress={close} accessibilityLabel={t('close')} hitSlop={12} testID="model-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <View style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
          <Icon name="Search" size={16} color={th.muted} />
          <TextInput testID="model-search" value={query} onChangeText={setQuery} placeholder={t('modelSearch')} placeholderTextColor={th.muted2} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel={t('modelSearch')} style={{ flex: 1, color: th.ink, fontSize: 15, paddingVertical: 0 }} />
          {!!query && <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('remove')}><Icon name="Close" size={15} color={th.muted} /></Pressable>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }} keyboardShouldPersistTaps="handled">
          {CHIPS.filter(c => c.id === 'all' || count(c.id) > 0).map(c => { const on = filter === c.id; return (
            <Pressable key={c.id} testID={`filter-${c.id}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(c.id)} style={{ height: 32, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface }}>
              <Text style={{ color: on ? th.accentStrong : th.ink, fontSize: 13, fontWeight: '600' }}>{t(c.key)}</Text>
            </Pressable>) })}
        </ScrollView>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {state === 'loading' && all.length === 0 && <ActivityIndicator color={th.muted} style={{ marginTop: 24 }} testID="models-loading" />}
          {state === 'error' && (
            <Pressable testID="model-retry" onPress={onRetry} accessibilityRole="button" style={{ marginBottom: 12 }}><Text style={{ color: th.danger }}>{t('modelsError')} {t('retry')}</Text></Pressable>)}
          {!groups.length && state !== 'loading' && <Text testID="model-empty" style={{ color: th.muted, textAlign: 'center', marginTop: 28 }}>{t('noModelMatch')}</Text>}
          {groups.map(g => (
            <View key={g.id} style={{ marginBottom: 12 }}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{g.title}</Text>
              {g.list.map(m => {
                const on = m.image ? m.id === selectedImage : m.id === selected, [fg, bg] = badgeColor(m.access), d = detail(m)
                return (
                  <Pressable key={(m.image ? 'img:' : '') + m.id} testID={`model-${m.id}`} disabled={!m.available} accessibilityRole="button" accessibilityLabel={`${m.name}. ${t(BADGE[m.access])}${d ? '. ' + d : ''}`} accessibilityState={{ selected: on, disabled: !m.available }} onPress={() => pick(m)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? th.accentSoft : th.surface, borderWidth: 1, borderColor: on ? th.accent : th.line, marginBottom: 6, opacity: m.available ? 1 : 0.5 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{m.name}</Text>
                      {!!d && <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12, marginTop: 1 }}>{d}</Text>}
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: bg }}><Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{t(BADGE[m.access])}</Text></View>
                    {on && <Icon name="Check" size={18} color={th.accentStrong} />}
                  </Pressable>)
              })}
            </View>))}
        </ScrollView>
      </View>
    </Modal>
  )
}
