import React from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { useT } from '../hooks/useT'
import { LANGUAGES } from '../lib/translate'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** The language picker the reference app shows before translating one message. */
export function TranslateSheet({ visible, onClose, onPick, onClear, canClear }: { visible: boolean; onClose: () => void; onPick: (code: string) => void; onClear?: () => void; canClear?: boolean }) {
  const th = useTheme(), t = useT()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('translatePick')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="tr-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {canClear && onClear && (
            <Pressable testID="tr-clear" onPress={() => { onClear(); onClose() }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
              <Icon name="Trash" size={18} color={th.danger} />
              <Text style={{ color: th.danger, fontWeight: '600' }}>{t('translateClear')}</Text>
            </Pressable>)}
          {LANGUAGES.map(l => (
            <Pressable key={l.code} testID={`tr-lang-${l.code}`} onPress={() => { onPick(l.code); onClose() }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
              <Text style={{ color: th.ink, fontWeight: '600' }}>{l.name}</Text>
              <Icon name="ChevR" size={16} color={th.muted2} />
            </Pressable>))}
        </ScrollView>
      </View>
    </Modal>
  )
}
