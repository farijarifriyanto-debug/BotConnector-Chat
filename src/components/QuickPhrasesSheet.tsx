import React, { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { usePhrases } from '../store/phrases'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/**
 * Quick Phrase management, like the reference app's page: saved snippets that the composer's
 * lightning button inserts into the message box. Order is edited with the up/down buttons
 * (the reference drags rows; see the parity notes).
 */
export function QuickPhrasesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), phrases = usePhrases(s => s.phrases)
  const [edit, setEdit] = useState<{ id?: string; title: string; content: string } | null>(null)

  const startAdd = () => setEdit({ title: '', content: '' })
  const startEdit = (id: string) => {
    const p = phrases.find(x => x.id === id); if (p) setEdit({ id, title: p.title, content: p.content })
  }
  const save = () => {
    if (!edit) return
    if (edit.id) usePhrases.getState().update(edit.id, { title: edit.title, content: edit.content })
    else usePhrases.getState().add(edit.title, edit.content)
    setEdit(null)
  }
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{txt}</Text>

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('qpTitle')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable testID="qp-add" onPress={startAdd} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('qpAdd')}><Icon name="Plus" size={20} color={th.ink} /></Pressable>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="qp-close"><Icon name="Close" color={th.ink} /></Pressable>
          </View>
        </View>

        {edit ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {label(t('qpTitleLabel'))}
            <TextInput testID="qp-title" value={edit.title} onChangeText={title => setEdit(e => (e ? { ...e, title } : e))} placeholder={t('qpTitle')} placeholderTextColor={th.muted2} style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
            <View style={{ height: 14 }} />
            {label(t('qpContentLabel'))}
            <TextInput testID="qp-content" value={edit.content} onChangeText={content => setEdit(e => (e ? { ...e, content } : e))} multiline placeholder={t('qpContentLabel')} placeholderTextColor={th.muted2} style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16, minHeight: 120, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable testID="qp-cancel" onPress={() => setEdit(null)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
              <Pressable testID="qp-save" onPress={save} disabled={!edit.title.trim() || !edit.content.trim()} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: edit.title.trim() && edit.content.trim() ? th.accent : th.surface3 }}><Text style={{ color: edit.title.trim() && edit.content.trim() ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('qpSave')}</Text></Pressable>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
            {!phrases.length && (
              <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
                <Icon name="Zap" size={40} color={th.muted2} />
                <Text testID="qp-empty" style={{ color: th.muted, fontSize: 14 }}>{t('qpEmpty')}</Text>
              </View>)}
            {phrases.map((p, i) => (
              <View key={p.id} style={{ borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <Pressable testID={`qp-row-${p.id}`} onPress={() => startEdit(p.id)} accessibilityRole="button" accessibilityLabel={p.title}>
                  <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{p.title}</Text>
                  <Text numberOfLines={2} style={{ color: th.muted, fontSize: 13, marginTop: 3 }}>{p.content}</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
                  <Pressable testID={`qp-up-${p.id}`} onPress={() => usePhrases.getState().move(p.id, -1)} disabled={i === 0} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qpUp')} style={{ opacity: i === 0 ? 0.35 : 1 }}><Icon name="ChevL" size={16} color={th.muted} /></Pressable>
                  <Pressable testID={`qp-down-${p.id}`} onPress={() => usePhrases.getState().move(p.id, 1)} disabled={i === phrases.length - 1} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qpDown')} style={{ opacity: i === phrases.length - 1 ? 0.35 : 1 }}><Icon name="ChevR" size={16} color={th.muted} /></Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable testID={`qp-del-${p.id}`} onPress={() => usePhrases.getState().remove(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('delete')}><Icon name="Trash" size={16} color={th.danger} /></Pressable>
                </View>
              </View>))}
          </ScrollView>)}
      </KeyboardAvoidingView>
    </Modal>
  )
}
