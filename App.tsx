import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ChatScreen } from './src/screens/ChatScreen'
import { OnboardingScreen, seenOnboarding } from './src/screens/OnboardingScreen'
import { SHOT, useShot, useShotLinks } from './src/lib/shot'
import { useAuth } from './src/store/auth'
import { scheduleSync } from './src/sync/store'
import { useTheme } from './src/theme/theme'

export default function App() {
  const th = useTheme(), status = useAuth(a => a.status), [intro, setIntro] = useState(() => !seenOnboarding())
  useShotLinks()
  const scene = useShot(s => s.scene)
  useEffect(() => { if (SHOT && ['home', 'local', 'providers', 'settings', 'language', 'search', 'personal'].includes(scene)) setIntro(false) }, [scene])   // screenshot build only
  useEffect(() => {
    void useAuth.getState().init()
    const sub = AppState.addEventListener('change', s => { if (s === 'active') scheduleSync(500) })
    return () => sub.remove()
  }, [])
  return (
    <SafeAreaProvider>
      <StatusBar style={th.dark ? 'light' : 'dark'} />
      {status === 'loading' ? <View style={{ flex: 1, backgroundColor: th.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={th.accent} /></View>
        : intro ? <OnboardingScreen onDone={() => setIntro(false)} /> : <ChatScreen />}
    </SafeAreaProvider>
  )
}
