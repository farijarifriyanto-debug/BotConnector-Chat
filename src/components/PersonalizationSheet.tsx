import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { MEMORY_ID } from '../lib/conv'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Standing instructions and short facts the AI should always know. Lives on this device (and is the same record the web Chat uses). */
export function PersonalizationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), rec = useChat(s => s.convs.find(c => c.id === MEMORY_ID))
  const [system, setSystem] = useState(''), [note, setNote] = useState('')
  useEffect(() => { if (visible) setSystem(rec?.system ?? '') }, [visible])   // eslint-disable-line react-hooks/exhaustive-deps
  const memory = rec?.memory ?? []
  const close = () => { if (system !== (rec?.system ?? '')) void useChat.getState().saveMemory({ system: system.slice(0, 4000) }); onClose() }
  const add = () => { const n = note.trim().slice(0, 300); if (!n || memory.length >= 50) return; void useChat.getState().saveMemory({ memory: [...memory, n] }); setNote('') }
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 } as const
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{txt}</Text>
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('personalization')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('done')} testID="personal-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {label(t('customInstr'))}
          <TextInput testID="personal-system" style={[input, { minHeight: 110, textAlignVertical: 'top' }]} value={system} onChangeText={setSystem} multiline placeholder={t('customInstrPh')} placeholderTextColor={th.muted2} maxLength={4000} />
          {label(t('memoryTitle'))}
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('memoryNote')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}><Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('memoryUse')}</Text><Switch testID="sw-memory" value={rec?.useMemory !== false} onValueChange={v => void useChat.getState().saveMemory({ useMemory: v })} /></View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TextInput testID="personal-note" style={[input, { flex: 1 }]} value={note} onChangeText={setNote} onSubmitEditing={add} placeholder={t('memoryAddPh')} placeholderTextColor={th.muted2} maxLength={300} />
            <Pressable testID="personal-add" onPress={add} accessibilityRole="button" style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: th.accent }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('memoryAdd')}</Text></Pressable>
          </View>
          {memory.length === 0 && <Text style={{ color: th.muted, marginTop: 14 }}>{t('memoryEmpty')}</Text>}
          {memory.map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
              <Text style={{ color: th.ink, flex: 1 }}>{m}</Text>
              <Pressable onPress={() => void useChat.getState().saveMemory({ memory: memory.filter((_, j) => j !== i) })} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('remove')} testID={`memory-del-${i}`}><Icon name="Trash" size={18} color={th.danger} /></Pressable>
            </View>))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
