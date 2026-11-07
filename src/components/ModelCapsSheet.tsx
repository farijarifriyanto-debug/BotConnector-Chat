import React from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { useT } from '../hooks/useT'
import { useChat } from '../store/chat'
import { useProviders, type ModelCaps } from '../store/providers'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const CAPS: { key: keyof ModelCaps; label: 'capsTools' | 'capsVision' | 'capsReasoning'; note?: 'capsToolsNote' }[] = [
  { key: 'tools', label: 'capsTools', note: 'capsToolsNote' },
  { key: 'vision', label: 'capsVision' },
  { key: 'reasoning', label: 'capsReasoning' },
]

/**
 * Per-model capability marking (audit E3): a custom provider's models start with everything off;
 * the person turns on only what they verified. Chat and the composer read these flags, so no
 * toggle ever promises something the model cannot do.
 */
export function ModelCapsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), providers = useProviders(s => s.providers)
  const toggle = (pid: string, mid: string, key: keyof ModelCaps, cur: boolean) => {
    void useProviders.getState().setModelCaps(pid, mid, { [key]: !cur }).then(() => useChat.getState().syncCustom())
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('capsTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="caps-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('capsNote')}</Text>
          {providers.every(p => !p.models.length) && <Text testID="caps-empty" style={{ color: th.muted, textAlign: 'center', marginVertical: 24 }}>{t('capsEmpty')}</Text>}
          {providers.map(p => p.models.map(m => (
            <View key={`${p.id}:${m.id}`} testID={`caps-row-${p.id}-${m.id}`} style={{ marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, padding: 14 }}>
              <Text style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{m.name || m.id}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{p.name}</Text>
              {CAPS.map(c => (
                <Pressable key={c.key} testID={`cap-${c.key}-${p.id}-${m.id}`} accessibilityRole="button" accessibilityState={{ selected: !!m.caps?.[c.key] }} onPress={() => toggle(p.id, m.id, c.key, !!m.caps?.[c.key])}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 44 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.ink, fontWeight: '600' }}>{t(c.label)}</Text>
                    {c.note ? <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{t(c.note)}</Text> : null}
                  </View>
                  <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: m.caps?.[c.key] ? th.accent : th.lineStrong, justifyContent: 'center', paddingHorizontal: 3 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: m.caps?.[c.key] ? th.accentInk : th.muted, alignSelf: m.caps?.[c.key] ? 'flex-end' : 'flex-start' }} />
                  </View>
                </Pressable>
              ))}
            </View>
          )))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
