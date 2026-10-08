import React from 'react'
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native'
import { Text } from '../components/Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useT } from '../hooks/useT'
import { legalUrl } from '../lib/links'
import { useAuth } from '../store/auth'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'

export function LoginScreen() {
  const th = useTheme(), t = useT(), busy = useAuth(a => a.busy), error = useAuth(a => a.error)
  const lang = useSettings(x => x.lang)
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
        <Pressable testID="guest-button" onPress={() => useAuth.getState().continueAsGuest()} accessibilityRole="button" style={{ marginTop: 10, alignSelf: 'stretch', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{t('guestBtn')}</Text></Pressable>
        <Text style={{ color: th.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 10 }}>{t('guestNote')}</Text>
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
          {(['privacy', 'terms'] as const).map(pg => <Pressable key={pg} testID={`login-${pg}`} onPress={() => void Linking.openURL(legalUrl(pg, lang)).catch(() => {})} accessibilityRole="link" hitSlop={8}><Text style={{ color: th.accentStrong, fontSize: 13, fontWeight: '600' }}>{t(pg === 'privacy' ? 'legalPrivacy' : 'legalTerms')}</Text></Pressable>)}
        </View>
      </View>
    </SafeAreaView>
  )
}
