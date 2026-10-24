import React, { useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { pickDocument } from '../lib/attachments'
import { PROJECT_FILES_MAX } from '../lib/conv'
import type { Conv, ProjectFile } from '../lib/types'
import { fileStatus, isTerminal, uploadFile } from '../api/files'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/**
 * Projects: a name plus documents that every bound chat can use (the reference app's
 * mobile "workspace" subset — managed projects, files and per-chat binding).
 */
export function ProjectsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), convs = useChat(s => s.convs)
  const projects = convs.filter(c => c.kind === 'project').sort((a, b) => b.updatedAt - a.updatedAt)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const open = openId ? projects.find(p => p.id === openId) ?? null : null

  const save = () => {
    if (!editing) return
    const name = editing.name.trim().slice(0, 80)
    if (!name) return
    if (editing.id) void useChat.getState().updateProject(editing.id, { title: name })
    else useChat.getState().createProject(name)
    setEditing(null)
  }

  const addFiles = async () => {
    if (!open) return
    const files = open.files ?? []
    if (files.length >= PROJECT_FILES_MAX) { setNote(t('projectFilesMax', { n: PROJECT_FILES_MAX })); return }
    const picked = await pickDocument(); if (!picked?.sourceUri) return
    setNote(null)
    const write = (next: ProjectFile[]) => useChat.getState().updateProject(open.id, { files: next })
    try {
      const up = await uploadFile({ uri: picked.sourceUri, name: picked.name, mime: picked.mime, size: picked.size })
      let entry: ProjectFile = { fileId: up.id, name: picked.name, mime: picked.mime, size: picked.size, status: up.status === 'ready' ? 'ready' : up.status === 'failed' ? 'failed' : 'processing' }
      await write([...files, entry])
      for (let i = 0; i < 20 && entry.status === 'processing'; i++) {   // the service parses documents after the upload
        await new Promise(r => setTimeout(r, 1500))
        const s = await fileStatus(up.id)
        entry = { ...entry, status: s.status === 'ready' ? 'ready' : s.status === 'failed' ? 'failed' : 'processing' }
        const cur = useChat.getState().convs.find(c => c.id === open.id)
        await write((cur?.files ?? []).map(f => (f.fileId === entry.fileId ? entry : f)))
        if (isTerminal(s.status)) break
      }
    } catch { setNote(t('projFileFail')) }
  }

  const removeFile = (fileId: string) => {
    if (!open) return
    void useChat.getState().updateProject(open.id, { files: (open.files ?? []).filter(f => f.fileId !== fileId) })
  }

  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>{txt}</Text>
  const button = (id: string, txt: string, onPress: () => void, danger = false) => (
    <Pressable testID={id} onPress={onPress} accessibilityRole="button" style={{ padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, marginTop: 10, alignItems: 'center' }}>
      <Text style={{ color: danger ? th.danger : th.ink, fontWeight: '600' }}>{txt}</Text>
    </Pressable>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!open && <Pressable testID="proj-back" onPress={() => { setOpenId(null); setEditing(null); setConfirming(false) }} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('back')}><Icon name="ChevL" size={20} color={th.ink} /></Pressable>}
            <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{open ? open.title : t('projTitle')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            {!open && <Pressable testID="proj-new" onPress={() => setEditing({ name: '' })} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('projNew')}><Icon name="Plus" size={20} color={th.ink} /></Pressable>}
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="proj-close"><Icon name="Close" color={th.ink} /></Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <View>
              {label(t('projNamePh'))}
              <TextInput testID="proj-name" value={editing.name} onChangeText={name => setEditing(e => (e ? { ...e, name } : e))} placeholder={t('projNamePh')} placeholderTextColor={th.muted2} style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 }} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable testID="proj-cancel" onPress={() => setEditing(null)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                <Pressable testID="proj-save" onPress={save} disabled={!editing.name.trim()} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: editing.name.trim() ? th.accent : th.surface3 }}><Text style={{ color: editing.name.trim() ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('qpSave')}</Text></Pressable>
              </View>
            </View>
          ) : open ? (
            <View>
              {label(t('projectFiles'))}
              <Text style={{ color: th.muted, fontSize: 12.5 }}>{t('projectFilesNote')}</Text>
              <View style={{ marginTop: 10 }}>
                {!(open.files ?? []).length && <Text testID="proj-files-empty" style={{ color: th.muted, fontSize: 13, paddingVertical: 6 }}>{t('projFilesEmpty')}</Text>}
                {(open.files ?? []).map(f => (
                  <View key={f.fileId || f.name} testID={`proj-file-${f.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                    {f.status === 'ready' ? <Icon name="Check" size={16} color={th.accentStrong} /> : f.status === 'failed' ? <Icon name="Close" size={16} color={th.danger} /> : <ActivityIndicator size="small" color={th.muted} />}
                    <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: th.ink, fontSize: 14 }}>{f.name}</Text>{f.status !== 'ready' && <Text style={{ color: f.status === 'failed' ? th.danger : th.muted, fontSize: 11.5 }}>{f.status === 'failed' ? t('fileFailed') : t('fileProcessing')}</Text>}</View>
                    <Pressable testID={`proj-file-del-${f.name}`} onPress={() => removeFile(f.fileId)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('delete')}><Icon name="Trash" size={16} color={th.muted} /></Pressable>
                  </View>))}
              </View>
              {(open.files ?? []).length < PROJECT_FILES_MAX
                ? button('proj-add-files', t('addFiles'), () => void addFiles())
                : <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 8 }}>{t('projectFilesMax', { n: PROJECT_FILES_MAX })}</Text>}
              {!!note && <Text testID="proj-note" accessibilityRole="alert" style={{ color: th.danger, fontSize: 13, marginTop: 8 }}>{note}</Text>}
              {button('proj-edit', t('rename'), () => setEditing({ id: open.id, name: open.title }))}
              {confirming
                ? <View style={{ marginTop: 10 }}>
                    <Text style={{ color: th.ink, fontWeight: '700' }}>{t('projDeleteQ')}</Text>
                    <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 4 }}>{t('projDeleteBody')}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <Pressable testID="proj-delete-cancel" onPress={() => setConfirming(false)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                      <Pressable testID="proj-delete-confirm" onPress={() => { void useChat.getState().removeProject(open.id); setOpenId(null); setConfirming(false) }} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: th.danger }}><Text style={{ color: '#fff', fontWeight: '700' }}>{t('delete')}</Text></Pressable>
                    </View>
                  </View>
                : button('proj-delete', t('projDelete'), () => setConfirming(true), true)}
            </View>
          ) : (
            <View>
              {!projects.length && (
                <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
                  <Icon name="Folder" size={40} color={th.muted2} />
                  <Text testID="proj-empty" style={{ color: th.muted, fontSize: 14 }}>{t('projEmpty')}</Text>
                  <Pressable testID="proj-new-empty" onPress={() => setEditing({ name: '' })} accessibilityRole="button" style={{ marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: th.accent }}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('projNew')}</Text></Pressable>
                </View>)}
              {projects.map(p => (
                <Pressable key={p.id} testID={`proj-row-${p.id}`} onPress={() => { setOpenId(p.id); setNote(null); setConfirming(false) }} accessibilityRole="button" accessibilityLabel={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
                  <Icon name="Folder" size={18} color={th.accentStrong} />
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{p.title}</Text><Text style={{ color: th.muted, fontSize: 12.5, marginTop: 2 }}>{(p.files ?? []).length} {t('projectFiles')}</Text></View>
                  <Icon name="ChevR" size={16} color={th.muted2} />
                </Pressable>))}
            </View>)}
        </ScrollView>
      </View>
    </Modal>
  )
}
