import * as AppleAuthentication from 'expo-apple-authentication'
import React from 'react'
import { useAuth } from '../store/auth'
import { useTheme } from '../theme/theme'

/** The system Sign in with Apple button (Apple HIG: system button, no smaller than the other sign-in buttons). iOS only. */
export function AppleButton({ onPress, testID = 'apple-signin', type = 'SIGN_IN', height = 50, radius = 14, disabled }: {
  onPress: () => void; testID?: string; type?: 'SIGN_IN' | 'CONTINUE'; height?: number; radius?: number; disabled?: boolean
}) {
  const th = useTheme(), apple = useAuth(a => a.apple)
  if (!apple) return null
  return (
    <AppleAuthentication.AppleAuthenticationButton
      testID={testID}
      buttonType={AppleAuthentication.AppleAuthenticationButtonType[type]}
      buttonStyle={th.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radius}
      style={{ alignSelf: 'stretch', height, opacity: disabled ? 0.6 : 1 }}
      onPress={() => { if (!disabled) onPress() }}
    />
  )
}
