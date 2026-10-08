import React from 'react'
import { Alert, Pressable, Switch, Text, View } from 'react-native'
import { useT } from '../hooks/useT'
import { useSync } from '../sync/store'
import { useTheme } from '../theme/theme'

const mb = (n: number) => (n / 1048576).toFixed(1)
/** Account sync: chats follow the account (text only) so the web Chat and this app show the same history. Off by default. */
export function SyncSection() {
  const th = useTheme(), t = useT(), { enabled, status } = useSync()
  const line = !status ? '' : status.phase === 'syncing' ? t('syncSyncing') : status.phase === 'idle' ? t('syncIdle', { n: status.usage?.items ?? 0, mb: mb(status.usage?.bytes ?? 0), max: mb(status.usage?.max_bytes ?? 0) }) + (status.pending ? t('syncPending', { p: status.pending }) : '')
    : status.phase === 'full' ? t('syncFullStatus', { mb: mb(status.usage?.bytes ?? 0), max: mb(status.usage?.max_bytes ?? 0) }) : status.phase === 'privacy' ? t('syncPrivacy') : status.phase === 'auth' ? t('syncAuth') : status.phase === 'rejected' ? t('syncRejected') : t('syncError')
  const purge = () => Alert.alert(t('syncPurge'), t('syncPurgeConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('syncPurgeYes'), style: 'destructive', onPress: () => void useSync.getState().disable(true) }])
  return (
    <View style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: th.ink, fontWeight: '600', flex: 1, paddingRight: 10 }}>{t('syncTitle')}</Text>
        <Switch testID="sw-sync" value={enabled} onValueChange={v => { if (v) void useSync.getState().enable(); else void useSync.getState().disable(false) }} />
      </View>
      <Text style={{ color: th.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>{t('syncNote')}</Text>
      {enabled && !!line && <Text testID="sync-status" style={{ color: status?.phase === 'idle' ? th.muted : th.danger, fontSize: 12.5, marginTop: 8 }}>{line}</Text>}
      {enabled && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
          <Pressable testID="sync-now" onPress={() => void useSync.getState().syncNow()} accessibilityRole="button"><Text style={{ color: th.accentStrong, fontWeight: '600' }}>{t('syncNow')}</Text></Pressable>
          <Pressable onPress={purge} accessibilityRole="button"><Text style={{ color: th.danger, fontWeight: '600' }}>{t('syncPurge')}</Text></Pressable>
        </View>)}
    </View>
  )
}
