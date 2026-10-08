import React, { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { canPie, chartSvg, PALETTE, type ChartData, type ChartType } from '../lib/chart'
import { t } from '../i18n/strings'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const nf = (lang: string, o: Intl.NumberFormatOptions) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', o).format

/** Bar / line / pie view of a numeric table, with per-series toggles. */
export function TableChart({ data, visible, onClose }: { data: ChartData; visible: boolean; onClose: () => void }) {
  const th = useTheme(), lang = useSettings(s => s.lang), { width } = useWindowDimensions()
  const [type, setType] = useState<ChartType>('bar')
  const [off, setOff] = useState<ReadonlySet<number>>(new Set())
  const pie = useMemo(() => canPie(data), [data])
  const svg = useMemo(() => {
    const shown = data.series.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], i })).filter(s => !off.has(s.i))
    return chartSvg({ ...data, series: shown }, type, { compact: nf(lang, { notation: 'compact', maximumFractionDigits: 2 }), full: nf(lang, { maximumFractionDigits: 4 }), titles: false }).replace(/currentColor/g, th.ink)
  }, [data, off, type, lang, th.ink])
  const w = Math.min(width - 32, 720)
  const toggle = (i: number) => setOff(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else if (n.size < data.series.length - 1) n.add(i); return n })   // the last visible series stays
  const pill = (label: string, on: boolean, press: () => void, id: string) => (
    <Pressable key={id} testID={id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={press}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface, marginRight: 8, marginBottom: 8 }}>
      <Text style={{ color: on ? th.accentStrong : th.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t(lang, 'chartBtn')}</Text>
          <Pressable onPress={onClose} accessibilityLabel={t(lang, 'close')} hitSlop={12} testID="chart-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {pill(t(lang, 'chartBar'), type === 'bar', () => setType('bar'), 'chart-type-bar')}
            {pill(t(lang, 'chartLine'), type === 'line', () => setType('line'), 'chart-type-line')}
            {pie && pill(t(lang, 'chartPie'), type === 'pie', () => setType('pie'), 'chart-type-pie')}
          </View>
          {data.series.length > 1 && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{data.series.map((s, i) => pill(s.name.slice(0, 18), !off.has(i), () => toggle(i), `chart-series-${i}`))}</View>}
          <View style={{ backgroundColor: th.surface, borderRadius: 14, borderWidth: 1, borderColor: th.line, padding: 8 }}>
            <SvgXml xml={svg} width={w - 16} height={((w - 16) * 360) / 640} testID="chart-svg" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
