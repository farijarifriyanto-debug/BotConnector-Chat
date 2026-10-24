import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { INSTR_PROMPT_MAX, INSTR_TITLE_MAX, instructionLabel } from '../lib/instructions'
import { useInstructions } from '../store/instructions'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/**
 * Instruction Injection: saved prompt cards, switched on or off, appended to the system
 * message of every request. Modelled on the reference app's settings page.
 */
export function InstructionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const items = useInstructions(s => s.items), active = useInstructions(s => s.active)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState(''), [prompt, setPrompt] = useState('')

  useEffect(() => { if (!visible) { setEditing(null); setTitle(''); setPrompt('') } }, [visible])
  useEffect(() => { if (editing && !items.some(i => i.id === editing)) setEditing(null) }, [editing, items])

  const startEdit = (id: string) => {
    const it = items.find(i => i.id === id)
    setEditing(id); setTitle(it?.title ?? ''); setPrompt(it?.prompt ?? '')
  }
  const addCard = () => { const id = useInstructions.getState().add('', ''); setEditing(id); setTitle(''); setPrompt('') }
  const saveCard = () => { if (editing) useInstructions.getState().update(editing, { title, prompt }); setEditing(null) }
  const deleteCard = () => { if (editing) useInstructions.getState().remove(editing); setEditing(null) }
  const on = new Set(active)
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 } as const
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{txt}</Text>

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          {editing
            ? <Pressable onPress={saveCard} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('back')} testID="instr-back"><Icon name="ChevL" color={th.ink} /></Pressable>
            : <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('instrTitle')}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {!editing && <Pressable onPress={addCard} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('instrAdd')} testID="instr-add"><Icon name="Plus" color={th.ink} /></Pressable>}
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('done')} testID="instr-close"><Icon name="Close" color={th.ink} /></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <>
              {label(t('instrName'))}
              <TextInput testID="instr-title-input" style={input} value={title} onChangeText={setTitle} placeholder={t('instrNamePh')} placeholderTextColor={th.muted2} maxLength={INSTR_TITLE_MAX} />
              {label(t('instrPrompt'))}
              <TextInput testID="instr-prompt-input" style={[input, { minHeight: 160, textAlignVertical: 'top' }]} value={prompt} onChangeText={setPrompt} placeholder={t('instrPromptPh')} placeholderTextColor={th.muted2} multiline maxLength={INSTR_PROMPT_MAX} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('instrActive')}</Text>
                <Switch testID="instr-active-switch" value={on.has(editing)} onValueChange={() => useInstructions.getState().toggle(editing)} />
              </View>
              <Pressable testID="instr-save" onPress={saveCard} accessibilityRole="button" style={{ marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: th.accent }}>
                <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('save')}</Text>
              </Pressable>
              <Pressable testID="instr-delete" onPress={deleteCard} accessibilityRole="button" style={{ marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: th.line }}>
                <Text style={{ color: th.danger, fontWeight: '600' }}>{t('remove')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('instrNote')}</Text>
              {items.length === 0 && <Text testID="instr-empty" style={{ color: th.muted, marginTop: 16 }}>{t('instrEmpty')}</Text>}
              {items.map(it => {
                const isOn = on.has(it.id)
                return (
                  <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: isOn ? th.lineStrong : th.line, backgroundColor: th.surface }}>
                    <Pressable testID={`instr-tip-${it.id}`} onPress={() => startEdit(it.id)} accessibilityRole="button" style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{instructionLabel(it) || t('instrUntitled')}</Text>
                      <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12.5, marginTop: 3 }}>{it.prompt.trim() || t('instrEmptyPrompt')}</Text>
                    </Pressable>
                    <Pressable testID={`instr-toggle-${it.id}`} onPress={() => useInstructions.getState().toggle(it.id)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: isOn }} accessibilityLabel={instructionLabel(it) || t('instrUntitled')}
                      style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: isOn ? th.accentStrong : th.lineStrong, backgroundColor: isOn ? th.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {isOn && <Icon name="Check" size={15} color={th.accentStrong} />}
                    </Pressable>
                  </View>)
              })}
              <Pressable testID="instr-add-row" onPress={addCard} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
                <Icon name="Plus" size={16} color={th.ink} /><Text style={{ color: th.ink, fontWeight: '600' }}>{t('instrAdd')}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
