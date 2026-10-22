import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppleSignupSheet } from './src/components/AppleSignupSheet'
import { ChatScreen } from './src/screens/ChatScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { OnboardingScreen, seenOnboarding } from './src/screens/OnboardingScreen'
import { SHOT, useShot, useShotLinks } from './src/lib/shot'
import { useAgent } from './src/agent/store'
import { onApprovalTap } from './src/agent/notify'
import { AgentSheet } from './src/components/AgentSheet'
import { AgentSessionSheet } from './src/components/AgentSessionSheet'
import { useAuth } from './src/store/auth'
import { scheduleSync } from './src/sync/store'
import { useTheme } from './src/theme/theme'

export default function App() {
  const th = useTheme(), status = useAuth(a => a.status), [intro, setIntro] = useState(() => !seenOnboarding())
  useShotLinks()
  const scene = useShot(s => s.scene)
  const agentSheet = useAgent(s => s.sheet)
  useEffect(() => { if (SHOT && ['home', 'local', 'providers', 'settings', 'language', 'search', 'personal'].includes(scene)) setIntro(false) }, [scene])   // screenshot build only
  useEffect(() => {
    void useAuth.getState().init()
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { void useAuth.getState().refreshAccount(); scheduleSync(500) } })   // plan/balance may have changed in the browser
    return () => sub.remove()
  }, [])
  // Tapping the approval notification opens that session, from anywhere in the app.
  useEffect(() => onApprovalTap(() => {
    const target = useAgent.getState().resume
    if (target) void useAgent.getState().openSession(target)
    else useAgent.getState().openPicker()
  }), [])
  return (
    <SafeAreaProvider>
      <StatusBar style={th.dark ? 'light' : 'dark'} />
      {status === 'loading' ? <View style={{ flex: 1, backgroundColor: th.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={th.accent} /></View>
        : (status === 'signedIn' || status === 'guest') ? (intro ? <OnboardingScreen onDone={() => setIntro(false)} /> : <ChatScreen />) : <LoginScreen />}
      <AppleSignupSheet />
      <AgentSheet visible={agentSheet === 'picker'} onClose={() => useAgent.getState().closeSheet()} onOpenSession={target => void useAgent.getState().openSession(target)} />
      <AgentSessionSheet visible={agentSheet === 'session'} onClose={() => useAgent.getState().closeSheet()} />
    </SafeAreaProvider>
  )
}
