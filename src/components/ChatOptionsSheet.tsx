import * as Clipboard from 'expo-clipboard'
import React, { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { toMarkdown } from '../lib/export'
import type { Conv } from '../lib/types'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Per-chat options: name, instructions for this chat, pin, export, delete. Saved when the sheet closes. */
export function ChatOptionsSheet({ visible, conv, onClose }: { visible: boolean; conv: Conv | null; onClose: () => void }) {
  const th = useTheme(), t = useT(), all = useChat(s => s.convs)
  const [title, setTitle] = useState(''), [system, setSystem] = useState(''), [projOpen, setProjOpen] = useState(false)
  const projects = all.filter(c => c.kind === 'project')
  const project = conv?.projectId ? projects.find(p => p.id === conv.projectId) : undefined
  useEffect(() => { if (visible && conv) { setTitle(conv.title); setSystem(conv.system) } }, [visible, conv?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!conv) return null
  const save = async () => {
    const patch: Parameters<ReturnType<typeof useChat.getState>['updateConv']>[1] = {}
    if (title.trim() && title.trim() !== conv.title) patch.title = title.trim().slice(0, 80)
    if (system !== conv.system) patch.system = system.slice(0, 4000)
    if (Object.keys(patch).length) await useChat.getState().updateConv(conv.id, patch)
  }
  const close = () => { void save(); onClose() }
  const exportChat = () => void Share.share({ message: toMarkdown(conv, { you: t('you'), assistant: t('assistant') }) }).catch(() => Alert.alert(t('exportFail')))
  const copyChat = () => void Clipboard.setStringAsync(toMarkdown(conv, { you: t('you'), assistant: t('assistant') }))
  const remove = () => Alert.alert(t('deleteChatQ'), conv.title || t('untitled'), [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: () => { onClose(); void useChat.getState().remove(conv.id) } }])
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 } as const
  const row = (label: string, onPress: () => void, id: string, danger = false) => <Pressable testID={id} onPress={onPress} accessibilityRole="button" style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, marginTop: 10, alignItems: 'center' }}><Text style={{ color: danger ? th.danger : th.ink, fontWeight: '600' }}>{label}</Text></Pressable>
  const saved = useChat.getState().convs.some(c => c.id === conv.id)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('rename')} · {t('instructions')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel={t('done')} testID="options-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {saved && <TextInput testID="options-title" style={input} value={title} onChangeText={setTitle} placeholder={t('untitled')} placeholderTextColor={th.muted2} maxLength={80} />}
          <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{t('instructions')}</Text>
          <TextInput testID="options-system" style={[input, { minHeight: 120, textAlignVertical: 'top' }]} value={system} onChangeText={setSystem} multiline placeholder={t('instructionsPh')} placeholderTextColor={th.muted2} maxLength={4000} />
          {saved && row(conv.pinned ? t('unpin') : t('pin'), () => { void useChat.getState().updateConv(conv.id, { pinned: !conv.pinned }); onClose() }, 'options-pin')}
          <Pressable testID="options-project" onPress={() => setProjOpen(true)} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: th.ink, fontWeight: '600' }}>{t('projPick')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ color: th.muted }}>{project?.title ?? t('projNone')}</Text><Icon name="ChevR" size={16} color={th.muted} /></View>
          </Pressable>
          {saved && row(t('exportBtn'), exportChat, 'options-export')}
          {saved && row(t('copy'), copyChat, 'options-copy')}
          {saved && row(t('delete'), remove, 'options-delete', true)}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={projOpen} transparent animationType="fade" onRequestClose={() => setProjOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setProjOpen(false)} accessibilityLabel={t('close')}>
          <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 10, paddingHorizontal: 12, maxHeight: '60%' }}>
            <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 }}>{t('projPick')}</Text>
            <ScrollView>
              <Pressable testID="proj-pick-none" onPress={() => { void useChat.getState().bindProject(conv.id, null); setProjOpen(false) }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6 }}>
                <Icon name="Close" size={18} color={th.muted} /><Text style={{ color: th.ink, fontSize: 15, flex: 1 }}>{t('projNone')}</Text>
              </Pressable>
              {projects.map(p => (
                <Pressable key={p.id} testID={`proj-pick-${p.id}`} onPress={() => { void useChat.getState().bindProject(conv.id, p.id); setProjOpen(false) }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6 }}>
                  <Icon name="Folder" size={18} color={th.accentStrong} /><Text numberOfLines={1} style={{ color: th.ink, fontSize: 15, flex: 1 }}>{p.title}</Text>
                  {conv.projectId === p.id && <Icon name="Check" size={18} color={th.accentStrong} />}
                </Pressable>))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  )
}
