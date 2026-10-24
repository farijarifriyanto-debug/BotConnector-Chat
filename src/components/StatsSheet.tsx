import React, { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { useT } from '../hooks/useT'
import { computeStats, type RangePreset } from '../lib/stats'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const RANGES: { preset: RangePreset; label: 'statAll' | 'stat30' | 'statMonth' | 'statQuarter' }[] = [
  { preset: 'all', label: 'statAll' },
  { preset: '30d', label: 'stat30' },
  { preset: 'lastMonth', label: 'statMonth' },
  { preset: 'lastQuarter', label: 'statQuarter' },
]

/** Statistics, like the reference app's page: totals, a one-year heatmap, a daily trend and ranks. */
export function StatsSheet({ visible, onClose, now }: { visible: boolean; onClose: () => void; now?: Date }) {
  const th = useTheme(), t = useT(), convs = useChat(s => s.convs)
  const [preset, setPreset] = useState<RangePreset>('all')
  // `now` is fixed for a test run; a real open uses the clock at that moment.
  const snapshot = useMemo(() => computeStats(convs, preset, now ?? new Date()), [convs, preset, now])

  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>{txt}</Text>
  const tile = (id: string, value: number, txt: string) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, borderRadius: 10, padding: 12 }}>
      <Text testID={id} style={{ color: th.ink, fontSize: 20, fontWeight: '700' }}>{String(value)}</Text>
      <Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{txt}</Text>
    </View>)
  const maxTrend = Math.max(1, ...snapshot.trend.map(d => d.count))
  const maxHeat = Math.max(1, ...snapshot.heatmap.map(d => d.count))
  const rank = (id: string, rows: { label: string; value: number }[]) => (
    <View>
      {!rows.length && <Text style={{ color: th.muted, fontSize: 13 }}>{t('statEmpty')}</Text>}
      {rows.slice(0, 5).map(r => (
        <View key={r.label} testID={`${id}-${r.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <Text numberOfLines={1} style={{ color: th.ink, fontSize: 13.5, flex: 1 }}>{r.label}</Text>
          <Text style={{ color: th.muted, fontSize: 13, fontWeight: '600' }}>{String(r.value)}</Text>
        </View>))}
    </View>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('statTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="st-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {RANGES.map(r => (
              <Pressable key={r.preset} testID={`st-range-${r.preset}`} onPress={() => setPreset(r.preset)} accessibilityRole="button" accessibilityState={{ selected: preset === r.preset }}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: preset === r.preset ? th.accent : th.line, backgroundColor: preset === r.preset ? th.accentSoft : th.surface }}>
                <Text style={{ color: preset === r.preset ? th.accentStrong : th.ink, fontSize: 13, fontWeight: '600' }}>{t(r.label)}</Text>
              </Pressable>))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {tile('st-conv', snapshot.conversations, t('statConversations'))}
            {tile('st-msg', snapshot.messages, t('statMessages'))}
            {tile('st-answers', snapshot.answers, t('statAnswers'))}
            {tile('st-in', snapshot.inputTokens, t('statInputTokens'))}
            {tile('st-out', snapshot.outputTokens, t('statOutputTokens'))}
            {tile('st-cached', snapshot.cachedTokens, t('statCachedTokens'))}
            {snapshot.costs.map(c => tile(`st-cost-${c.label}`, Number((c.value / 1_000_000).toFixed(4)), t('statCost', { c: c.label })))}
          </View>

          {label(t('statHeatmap'))}
          <View testID="st-heat" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {snapshot.heatmap.map(d => (
              <View key={d.day} style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: d.count ? th.accent : th.surface3, opacity: d.count ? 0.35 + 0.65 * (d.count / maxHeat) : 1 }} />))}
          </View>

          {label(t('statTrend'))}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {snapshot.trend.map(d => (
              <View key={d.day} style={{ flex: 1, height: Math.max(2, Math.round((d.count / maxTrend) * 76)), borderRadius: 2, backgroundColor: d.count ? th.accent : th.surface3 }} />))}
          </View>

          {label(t('statModels'))}
          {rank('st-model', snapshot.models)}
          {label(t('statTopics'))}
          {rank('st-topic', snapshot.topics)}
          <Text style={{ color: th.muted2, fontSize: 12, marginTop: 16 }}>{t('statNote')}</Text>
        </ScrollView>
      </View>
    </Modal>
  )
}
