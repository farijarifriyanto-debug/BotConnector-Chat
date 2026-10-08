import { StatusBar } from 'expo-status-bar'
import React, { useEffect } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ChatScreen } from './src/screens/ChatScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { useAuth } from './src/store/auth'
import { scheduleSync } from './src/sync/store'
import { useTheme } from './src/theme/theme'

export default function App() {
  const th = useTheme(), status = useAuth(a => a.status)
  useEffect(() => {
    void useAuth.getState().init()
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { void useAuth.getState().refreshAccount(); scheduleSync(500) } })   // plan/balance may have changed in the browser
    return () => sub.remove()
  }, [])
  return (
    <SafeAreaProvider>
      <StatusBar style={th.dark ? 'light' : 'dark'} />
      {status === 'loading' ? <View style={{ flex: 1, backgroundColor: th.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={th.accent} /></View>
        : status === 'signedIn' ? <ChatScreen /> : <LoginScreen />}
    </SafeAreaProvider>
  )
}
