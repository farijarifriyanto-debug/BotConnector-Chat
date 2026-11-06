import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Linking, Pressable, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Text } from './Text'
import { useTheme } from '../theme/theme'
import { useT } from '../hooks/useT'

export function ProviderQrScanner({ onScan, onCancel }: { onScan: (raw: string) => void; onCancel: () => void }) {
  const th = useTheme(), t = useT(), [permission, request, getPermission] = useCameraPermissions()
  const consumed = useRef(false), [scanned, setScanned] = useState(false), [failed, setFailed] = useState(false), [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    let mounted = true
    const sub = AppState.addEventListener('change', s => {
      setActive(s === 'active')
      if (s === 'active') void getPermission().then(result => { if (mounted && result.granted) setFailed(false) }).catch(() => { if (mounted) setFailed(true) })
    })
    return () => { mounted = false; sub.remove() }
  }, [getPermission])
  useEffect(() => () => { consumed.current = true }, [])
  const action = { minHeight: 48, padding: 14, borderRadius: 12, alignItems: 'center' as const, backgroundColor: th.accent, marginTop: 14 }
  return <View style={{ paddingVertical: 18, gap: 12 }}>
    <Text style={{ color: th.ink, fontSize: 22, fontWeight: '600' }}>{t('qrScan')}</Text>
    {!permission ? <ActivityIndicator color={th.accent} /> : !permission.granted ? <>
      <Text style={{ color: th.muted, lineHeight: 22 }}>{t('qrCameraPermission')}</Text>
      <Pressable style={action} accessibilityRole="button" onPress={() => { void (permission.canAskAgain ? request() : Linking.openSettings()).catch(() => setFailed(true)) }}><Text style={{ color: th.accentInk }}>{t(permission.canAskAgain ? 'qrAllow' : 'qrSettings')}</Text></Pressable>
    </> : active && !scanned && !failed ? <>
      <View style={{ height: 280, overflow: 'hidden', borderRadius: 20 }}><CameraView testID="provider-camera" style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={() => setFailed(true)} onBarcodeScanned={({ data }) => {
        if (consumed.current || AppState.currentState !== 'active') return
        consumed.current = true; setScanned(true); onScan(data)
      }} /></View><Text style={{ color: th.muted, lineHeight: 22 }}>{t('qrAim')}</Text>
    </> : null}
    {failed && <Text accessibilityRole="alert" style={{ color: th.danger }}>{t('qrCameraFailed')}</Text>}
    <Pressable testID="qr-cancel" accessibilityRole="button" onPress={() => { consumed.current = true; onCancel() }} style={{ ...action, backgroundColor: th.surface, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink }}>{t('cancel')}</Text></Pressable>
  </View>
}
