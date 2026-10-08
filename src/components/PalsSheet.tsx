import React, { useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useT } from '../hooks/useT'
import { useChat } from '../store/chat'
import { useSettings } from '../store/settings'
import { builtinPals, usePals, type Pal } from '../store/pals'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Assistants: saved instructions that start a chat which always answers a certain way. */
export function PalsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang), mine = usePals(s => s.pals)
  const [edit, setEdit] = useState<{ id?: string; name: string; system: string } | null>(null)
  const start = (p: Pal) => { useChat.getState().startWith(p.system); onClose() }
  const del = (p: Pal) => Alert.alert(p.name, t('palDeleteQ'), [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: () => usePals.getState().remove(p.id) }])
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16, marginTop: 10 } as const
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const card = (p: Pal, own: boolean) => (
    <Pressable key={p.id} testID={`pal-${p.id}`} onPress={() => start(p)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: th.accentStrong, fontWeight: '800', fontSize: 16 }}>{p.name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '600', fontSize: 15 }}>{p.name}</Text><Text numberOfLines={2} style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{p.system}</Text></View>
      {own && <Pressable onPress={() => setEdit({ id: p.id, name: p.name, system: p.system })} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('palEdit')} testID={`pal-edit-${p.id}`}><Icon name="Refresh" size={18} color={th.muted} /></Pressable>}
      {own && <Pressable onPress={() => del(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('delete')} testID={`pal-del-${p.id}`}><Icon name="Trash" size={18} color={th.danger} /></Pressable>}
    </Pressable>)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('palsTitle')}</Text>
          <Pressable onPress={() => (edit ? setEdit(null) : onClose())} hitSlop={12} accessibilityLabel={t('close')} testID="pals-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {edit ? (
            <View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput testID="pal-name" style={[input, { flex: 1 }]} value={edit.name} onChangeText={v => setEdit({ ...edit, name: v })} placeholder={t('palName')} placeholderTextColor={th.muted2} maxLength={40} />
              </View>
              <TextInput testID="pal-prompt" style={[input, { minHeight: 150, textAlignVertical: 'top' }]} value={edit.system} onChangeText={v => setEdit({ ...edit, system: v })} multiline placeholder={t('palPrompt')} placeholderTextColor={th.muted2} maxLength={4000} />
              <Pressable testID="pal-save" onPress={() => { usePals.getState().save(edit); setEdit(null) }} disabled={!edit.name.trim() || !edit.system.trim()} accessibilityRole="button" style={{ marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center', opacity: edit.name.trim() && edit.system.trim() ? 1 : 0.5 }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('save')}</Text></Pressable>
            </View>
          ) : (
            <View>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('palsIntro')}</Text>
              {label(t('palsMine'))}
              {mine.map(p => card(p, true))}
              <Pressable testID="pal-new" onPress={() => setEdit({ name: '', system: '' })} accessibilityRole="button" style={{ padding: 13, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: th.lineStrong, alignItems: 'center' }}><Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('palNew')}</Text></Pressable>
              {label(t('palsBuiltin'))}
              {builtinPals(lang).map(p => card(p, false))}
            </View>)}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
