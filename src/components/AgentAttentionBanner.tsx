import React from 'react'
import { Pressable, View } from 'react-native'
import { useAgent } from '../agent/store'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { Text } from './Text'

/**
 * App-level banner shown when an approval arrived while the session screen was closed.
 * Deliberately in-app (no push entitlement): the phone tells the user the moment they look at it.
 */
export function AgentAttentionBanner() {
  const th = useTheme(), t = useT()
  const attention = useAgent(s => s.attention), sheet = useAgent(s => s.sheet), resume = useAgent(s => s.resume)
  if (!attention || sheet !== 'closed') return null
  const open = () => {
    const target = useAgent.getState().resume ?? resume
    if (target) void useAgent.getState().openSession(target)
    else useAgent.getState().openPicker()
  }
  return (
    <Pressable
      testID="agent-attention"
      onPress={open}
      accessibilityRole="button"
      style={{ position: 'absolute', left: 12, right: 12, bottom: 24, padding: 12, borderRadius: 14, backgroundColor: th.accent, flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <Icon name="Pencil" size={16} color={th.accentInk} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: th.accentInk, fontWeight: '700', fontSize: 13 }}>{t('agentAttentionTitle')}</Text>
        <Text style={{ color: th.accentInk, fontSize: 12 }}>{t('agentAttentionBody')}</Text>
      </View>
      <Icon name="Chevron" size={16} color={th.accentInk} />
    </Pressable>
  )
}
