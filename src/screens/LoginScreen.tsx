import React from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useT } from '../hooks/useT'
import { useAuth } from '../store/auth'
import { useTheme } from '../theme/theme'

export function LoginScreen() {
  const th = useTheme(), t = useT(), busy = useAuth(a => a.busy), error = useAuth(a => a.error)
  const msg = error ? t(error === 'unavailable' || error === 'network' ? 'loginUnavailable' : 'loginFailed') : null
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <Image source={require('../../assets/bico/bico-hero.png')} style={{ width: 180, height: 180 }} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 12 }}>{t('loginTitle')}</Text>
        <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 }}>{t('loginSub')}</Text>
        {!!msg && <Text testID="login-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 14, textAlign: 'center' }}>{msg}</Text>}
        <Pressable testID="login-button" onPress={() => void useAuth.getState().login()} disabled={busy} accessibilityRole="button" style={{ marginTop: 24, alignSelf: 'stretch', padding: 15, borderRadius: 14, backgroundColor: th.accent, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: th.accentInk, fontSize: 16, fontWeight: '700' }}>{t('loginButton')}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
