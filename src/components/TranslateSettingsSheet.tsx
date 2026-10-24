import React from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { DEFAULT_TRANSLATE_PROMPT } from '../lib/translate'
import { useChat } from '../store/chat'
import { useTranslate } from '../store/translate'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Translation model settings, the reference app's "Translation Model" card: model, prompt, thinking. */
export function TranslateSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const models = useChat(s => s.models), chatModelId = useChat(s => s.modelId)
  const { model, prompt, think, setModel, setPrompt, setThink } = useTranslate()
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>{txt}</Text>
  const row = (id: string, name: string, active: boolean, onPress: () => void) => (
    <Pressable key={id} testID={id} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: active ? th.accent : th.line, backgroundColor: active ? th.accentSoft : th.surface }}>
      <Text style={{ color: th.ink, fontWeight: '600', flex: 1 }}>{name}</Text>
      {active && <Icon name="Check" size={18} color={th.accentStrong} />}
    </Pressable>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('trModelLabel')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="trs-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {row('trs-model-default', t('trModelDefault'), !model, () => setModel(null))}
          {models.filter(m => !m.image).map(m => row(`trs-model-${m.id}`, m.name, (model ?? chatModelId) === m.id, () => setModel(m.id)))}

          {label(t('trPromptLabel'))}
          <TextInput testID="trs-prompt" value={prompt} onChangeText={setPrompt} multiline placeholder={DEFAULT_TRANSLATE_PROMPT} placeholderTextColor={th.muted2}
            style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 14, minHeight: 150, textAlignVertical: 'top' }} />
          <Pressable testID="trs-reset" onPress={() => setPrompt('')} accessibilityRole="button" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <Text style={{ color: th.accentStrong, fontWeight: '600' }}>{t('trReset')}</Text>
          </Pressable>

          <Pressable testID="trs-think" onPress={() => setThink(!think)} accessibilityRole="switch" accessibilityState={{ checked: think }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.line }}>
            <Text style={{ color: th.ink, fontWeight: '600', flex: 1 }}>{t('trThink')}</Text>
            {think && <Icon name="Check" size={18} color={th.accentStrong} />}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}
