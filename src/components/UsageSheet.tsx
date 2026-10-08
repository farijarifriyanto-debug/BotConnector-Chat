import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { Icon } from './Icons'
import { fetchUsage, type Usage, type WindowKey } from '../api/api'
import { useT } from '../hooks/useT'
import { barColor, money, timeLeft } from '../lib/usage'
import { useAuth } from '../store/auth'
import { useTheme } from '../theme/theme'

const WINDOWS: { key: WindowKey; label: 'usageW5' | 'usageWeek' | 'usageMonth' }[] = [{ key: 'fiveHour', label: 'usageW5' }, { key: 'weekly', label: 'usageWeek' }, { key: 'monthly', label: 'usageMonth' }]

/** What the account has used: plan allowance windows (percent, like the web Workspace) and the pay-as-you-go balance. */
export function UsageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), account = useAuth(a => a.account)
  const [data, setData] = useState<Usage | null>(null), [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const load = useCallback(async () => {
    setState('loading')
    try { setData(await fetchUsage()); setState('idle'); void useAuth.getState().refreshAccount() } catch { setState('error') }
  }, [])
  useEffect(() => { if (visible) void load() }, [visible, load])
  const left = (iso: string | null) => { const x = timeLeft(iso); return x ? t('usageResets', { t: [x.d ? `${x.d}${t('uD')}` : '', x.h ? `${x.h}${t('uH')}` : '', !x.d && x.m ? `${x.m}${t('uM')}` : ''].filter(Boolean).join(' ') || `1${t('uM')}` }) : '' }
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const card = { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, gap: 14 } as const
  const wins = data ? WINDOWS.filter(w => data.windows[w.key]) : []
  const c24 = account?.cloud
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('usageTitle')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable testID="usage-refresh" onPress={() => void load()} disabled={state === 'loading'} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('usageRefresh')}><Icon name="Refresh" color={th.ink} /></Pressable>
            <Pressable testID="usage-close" onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}><Icon name="Close" color={th.ink} /></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {state === 'loading' && !data && <ActivityIndicator testID="usage-loading" color={th.muted} style={{ marginTop: 30 }} />}
          {state === 'error' && (
            <View testID="usage-error" accessibilityRole="alert" style={{ padding: 14, borderRadius: 12, backgroundColor: th.dangerSoft }}>
              <Text style={{ color: th.danger }}>{t('usageDown')}</Text>
              <Pressable testID="usage-retry" onPress={() => void load()} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 6 }}><Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('retry')}</Text></Pressable>
            </View>)}
          {!!data && <>
            {label(t('usagePlan'))}
            <View style={card}>
              <Text style={{ color: th.ink, fontSize: 16, fontWeight: '700' }}>{data.plan ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1) : t('acctDefault')}</Text>
              {wins.length > 0 ? wins.map(w => { const x = data.windows[w.key]!, col = th[barColor(x.percent)]; return (
                <View key={w.key} testID={`usage-${w.key}`}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: th.ink, fontSize: 14, fontWeight: '600' }}>{t(w.label)}</Text>
                    <Text style={{ color: th.ink, fontSize: 14 }}>{t('usageUsed', { p: Math.round(x.percent) })}</Text>
                  </View>
                  <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(x.percent) }} style={{ height: 8, borderRadius: 4, backgroundColor: th.surface3, overflow: 'hidden' }}><View style={{ height: 8, width: `${Math.max(x.percent > 0 ? 2 : 0, x.percent)}%`, backgroundColor: col }} /></View>
                  {!!left(x.resetsAt) && <Text style={{ color: th.muted, fontSize: 12, marginTop: 4 }}>{left(x.resetsAt)}</Text>}
                </View>) })
                : c24 ? <View testID="usage-free24"><Text style={{ color: th.muted, fontSize: 13 }}>{t('usageFree24', { u: c24.used_tokens_24h.toLocaleString('en-US'), l: c24.limit_tokens_24h.toLocaleString('en-US') })}</Text></View> : null}
              {wins.length > 0 && <Text style={{ color: th.muted2, fontSize: 12 }}>{t('usageNote')}</Text>}
            </View>
            {label(t('usagePayg'))}
            <View testID="usage-payg" style={card}>
              <View><Text style={{ color: th.muted, fontSize: 12 }}>{t('usageAvail')}</Text><Text style={{ color: th.ink, fontSize: 22, fontWeight: '800' }}>{money(data.payg.available, data.payg.currency)}</Text></View>
              {data.payg.reserved > 0 && <Text style={{ color: th.muted, fontSize: 13 }}>{t('usageReserved')}: {money(data.payg.reserved, data.payg.currency)}</Text>}
              <Text style={{ color: th.muted, fontSize: 13 }}>{t('usageSpend')}: {money(data.payg.monthSpend, data.payg.currency)}{data.payg.spendLimit ? ` / ${money(data.payg.spendLimit, data.payg.currency)}` : ''}</Text>
            </View>
          </>}
        </ScrollView>
      </View>
    </Modal>
  )
}
