import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { createPairCode, laptopId, revokeDevice } from '../laptop/api'
import { useLaptop } from '../laptop/store'
import { useT } from '../hooks/useT'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Connect a laptop running BotConnector Local; its models then appear in the model picker. */
export function LaptopSheet({ visible, onClose, onUsed }: { visible: boolean; onClose: () => void; onUsed?: () => void }) {
  const th = useTheme(), t = useT(), { entries, loading, error } = useLaptop()
  const [code, setCode] = useState<{ code: string; expiresAt?: number } | null>(null), [pairing, setPairing] = useState(false), [pairErr, setPairErr] = useState(false)
  useEffect(() => { if (visible) void useLaptop.getState().refresh() }, [visible])
  const pair = async () => { setPairing(true); setPairErr(false); try { setCode(await createPairCode()) } catch { setPairErr(true) } setPairing(false) }
  const remove = (id: string, name: string) => Alert.alert(name, t('lapRemove') + '?', [{ text: t('cancel'), style: 'cancel' }, { text: t('lapRemove'), style: 'destructive', onPress: () => { void revokeDevice(id).catch(() => {}).then(() => useLaptop.getState().refresh()) } }])
  const use = (id: string) => { useChat.getState().selectModel(id); onClose(); onUsed?.() }
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const mins = code?.expiresAt ? Math.max(1, Math.round((code.expiresAt - Date.now()) / 60000)) : 10
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('laptop')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="laptop-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('laptopNote')}</Text>
          <Pressable testID="laptop-pair" onPress={pair} disabled={pairing} accessibilityRole="button" style={{ marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center' }}>{pairing ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('lapPair')}</Text>}</Pressable>
          {pairErr && <Text accessibilityRole="alert" style={{ color: th.danger, marginTop: 8 }}>{t('errUnavailable')}</Text>}
          {!!code && (
            <View style={{ marginTop: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, alignItems: 'center' }}>
              <Text selectable testID="pair-code" style={{ color: th.ink, fontSize: 32, fontWeight: '800', letterSpacing: 4 }}>{code.code}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{t('lapExpires', { m: mins })}</Text>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' }}>{t('lapPairHelp')}</Text>
            </View>)}
          {label(t('lapDevices'))}
          {loading && entries.length === 0 && <ActivityIndicator color={th.muted} />}
          {!loading && entries.length === 0 && <Text style={{ color: th.muted }}>{error ? t('errUnavailable') : t('lapNone')}</Text>}
          {entries.map(({ device, models }) => (
            <View key={device.id} testID={`device-${device.name}`} style={{ padding: 12, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: device.online ? '#22c55e' : th.muted2 }} />
                <Text style={{ color: th.ink, fontWeight: '700', fontSize: 15, flex: 1 }}>{device.name}</Text>
                <Text style={{ color: th.muted, fontSize: 12 }}>{device.online ? t('lapOnline') : t('lapOffline')}</Text>
                <Pressable onPress={() => remove(device.id, device.name)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('lapRemove')}><Icon name="Trash" size={18} color={th.danger} /></Pressable>
              </View>
              {!device.online && <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{t('lapOfflineHint')}</Text>}
              {models.length === 0 && device.online && <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{t('lapNoModels')}</Text>}
              {models.map(m => (
                <View key={m.runtime + m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Text numberOfLines={1} style={{ color: th.ink, flex: 1, fontSize: 14 }}>{m.name}{m.loaded ? ` · ${t('lapLoaded')}` : ''}</Text>
                  <Pressable testID={`use-${m.id}`} disabled={!device.online} onPress={() => use(laptopId(device.id, m.runtime, m.id))} accessibilityRole="button" style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: th.accent, opacity: device.online ? 1 : 0.4 }}><Text style={{ color: th.accentInk, fontWeight: '700', fontSize: 13 }}>{t('lapUse')}</Text></Pressable>
                </View>))}
            </View>))}
          <Pressable onPress={() => void useLaptop.getState().refresh()} accessibilityRole="button" style={{ alignSelf: 'center', padding: 10 }}><Text style={{ color: th.accentStrong, fontWeight: '600' }}>{t('lapRefresh')}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}
