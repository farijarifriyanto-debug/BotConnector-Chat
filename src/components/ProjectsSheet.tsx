import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View, Image } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { pickDocument } from '../lib/attachments'
import { PROJECT_FILES_MAX } from '../lib/conv'
import type { ProjectFile } from '../lib/types'
import { downloadFile, fileStatus, isTerminal, uploadFile } from '../api/files'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)
const dateText = (t?: number) => { if (!t) return ''; const d = new Date(t), p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const isText = (mime: string) => /^text\/|json|xml|markdown|csv/i.test(mime)
const isImage = (mime: string) => /^image\//i.test(mime)

/**
 * Projects: a name plus documents every bound chat can use. The document list follows the
 * reference app's file browser where this app's contract allows it: sort by name/size,
 * preview the original document, rename its label, export/share it, copy its id and remove
 * it from the project.
 */
export function ProjectsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), convs = useChat(s => s.convs)
  const projects = convs.filter(c => c.kind === 'project').sort((a, b) => b.updatedAt - a.updatedAt)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null)
  const [renaming, setRenaming] = useState<{ fileId: string; name: string } | null>(null)
  const [actionsFor, setActionsFor] = useState<ProjectFile | null>(null)
  const [preview, setPreview] = useState<{ name: string; kind: 'text' | 'image' | 'none'; text?: string; uri?: string } | null>(null)
  const [sort, setSort] = useState<{ by: 'name' | 'size'; desc: boolean }>({ by: 'name', desc: false })
  const [note, setNote] = useState<string | null>(null), [busyFile, setBusyFile] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const open = openId ? projects.find(p => p.id === openId) ?? null : null

  const files = open?.files ?? []
  const sorted = [...files].sort((a, b) => {
    const by = sort.by === 'name' ? a.name.localeCompare(b.name) : a.size - b.size
    return sort.desc ? -by : by
  })

  const writeFiles = (next: ProjectFile[]) => { if (open) void useChat.getState().updateProject(open.id, { files: next }) }
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
    if (files.length >= PROJECT_FILES_MAX) { setNote(t('projectFilesMax', { n: PROJECT_FILES_MAX })); return }
    const picked = await pickDocument(); if (!picked?.sourceUri) return
    setNote(null)
    try {
      const up = await uploadFile({ uri: picked.sourceUri, name: picked.name, mime: picked.mime, size: picked.size })
      let entry: ProjectFile = { fileId: up.id, name: picked.name, mime: picked.mime, size: picked.size, addedAt: Date.now(), status: up.status === 'ready' ? 'ready' : up.status === 'failed' ? 'failed' : 'processing' }
      writeFiles([...files, entry])
      for (let i = 0; i < 20 && entry.status === 'processing'; i++) {
        await new Promise(r => setTimeout(r, 1500))
        const s = await fileStatus(up.id)
        entry = { ...entry, status: s.status === 'ready' ? 'ready' : s.status === 'failed' ? 'failed' : 'processing' }
        const cur = useChat.getState().convs.find(c => c.id === open.id)
        writeFiles((cur?.files ?? []).map(f => (f.fileId === entry.fileId ? entry : f)))
        if (isTerminal(s.status)) break
      }
    } catch { setNote(t('projFileFail')) }
  }

  const openPreview = async (f: ProjectFile) => {
    setActionsFor(null); setBusyFile(f.fileId); setNote(null)
    try {
      if (isImage(f.mime)) {
        const got = await downloadFile(f.fileId)
        setPreview({ name: f.name, kind: 'image', uri: got.uri })
      } else if (isText(f.mime)) {
        const got = await downloadFile(f.fileId)
        const text = await FileSystem.readAsStringAsync(got.uri)
        setPreview({ name: f.name, kind: 'text', text: text.slice(0, 20000) })
      } else setPreview({ name: f.name, kind: 'none' })
    } catch { setNote(t('projPreviewFail')) }
    finally { setBusyFile(null) }
  }

  const exportFile = async (f: ProjectFile) => {
    setActionsFor(null); setBusyFile(f.fileId); setNote(null)
    try {
      const got = await downloadFile(f.fileId)
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(got.uri, { mimeType: got.mime, dialogTitle: f.name })
    } catch { setNote(t('projExportFail')) }
    finally { setBusyFile(null) }
  }

  const saveRename = () => {
    if (!renaming) return
    const name = renaming.name.trim().slice(0, 120)
    if (!name) return
    writeFiles(files.map(f => (f.fileId === renaming.fileId ? { ...f, name } : f)))
    setRenaming(null)
  }

  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>{txt}</Text>
  const button = (id: string, txt: string, onPress: () => void, danger = false) => (
    <Pressable testID={id} onPress={onPress} accessibilityRole="button" style={{ padding: 13, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, marginTop: 10, alignItems: 'center' }}>
      <Text style={{ color: danger ? th.danger : th.ink, fontWeight: '600' }}>{txt}</Text>
    </Pressable>)
  const act = (id: string, txt: string, icon: Parameters<typeof Icon>[0]['name'], onPress: () => void, danger = false) => (
    <Pressable testID={id} onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8 }}>
      <Icon name={icon} size={18} color={danger ? th.danger : th.muted} />
      <Text style={{ color: danger ? th.danger : th.ink, fontSize: 15, flex: 1 }}>{txt}</Text>
    </Pressable>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            {!!open && <Pressable testID="proj-back" onPress={() => { setOpenId(null); setEditing(null); setRenaming(null); setConfirming(false); setNote(null) }} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('back')}><Icon name="ChevL" size={20} color={th.ink} /></Pressable>}
            <Text numberOfLines={1} style={{ color: th.ink, fontSize: 18, fontWeight: '700', flex: 1 }}>{open ? open.title : t('projTitle')}</Text>
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

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable testID="proj-sort-name" onPress={() => setSort(s => ({ by: 'name', desc: s.by === 'name' ? !s.desc : false }))} accessibilityRole="button" accessibilityState={{ selected: sort.by === 'name' }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: sort.by === 'name' ? th.accent : th.line, backgroundColor: sort.by === 'name' ? th.accentSoft : th.surface }}><Text style={{ color: sort.by === 'name' ? th.accentStrong : th.ink, fontSize: 12.5, fontWeight: '600' }}>{t('projSortName')}</Text></Pressable>
                <Pressable testID="proj-sort-size" onPress={() => setSort(s => ({ by: 'size', desc: s.by === 'size' ? !s.desc : false }))} accessibilityRole="button" accessibilityState={{ selected: sort.by === 'size' }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: sort.by === 'size' ? th.accent : th.line, backgroundColor: sort.by === 'size' ? th.accentSoft : th.surface }}><Text style={{ color: sort.by === 'size' ? th.accentStrong : th.ink, fontSize: 12.5, fontWeight: '600' }}>{t('projSortSize')}</Text></Pressable>
                <Text style={{ color: th.muted2, fontSize: 12, alignSelf: 'center' }}>{sort.desc ? '↓' : '↑'}</Text>
              </View>

              {!!renaming && (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
                  <Text style={{ color: th.muted, fontSize: 12 }}>{t('projRenameNote')}</Text>
                  <TextInput testID="proj-file-name" value={renaming.name} onChangeText={name => setRenaming(r => (r ? { ...r, name } : r))} placeholder={t('projNamePh')} placeholderTextColor={th.muted2} style={{ borderWidth: 1, borderColor: th.line, borderRadius: 10, padding: 10, color: th.ink, backgroundColor: th.bg, fontSize: 15, marginTop: 8 }} />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable testID="proj-file-cancel" onPress={() => setRenaming(null)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
                    <Pressable testID="proj-file-save" onPress={saveRename} disabled={!renaming.name.trim()} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: renaming.name.trim() ? th.accent : th.surface3 }}><Text style={{ color: renaming.name.trim() ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('qpSave')}</Text></Pressable>
                  </View>
                </View>)}

              <View style={{ marginTop: 8 }}>
                {!files.length && <Text testID="proj-files-empty" style={{ color: th.muted, fontSize: 13, paddingVertical: 6 }}>{t('projFilesEmpty')}</Text>}
                {sorted.map(f => (
                  <Pressable key={f.fileId || f.name} testID="proj-file-row" accessibilityRole="button" accessibilityLabel={f.name} onPress={() => { setRenaming(null); setActionsFor(f) }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 }}>
                    {busyFile === f.fileId ? <ActivityIndicator size="small" color={th.muted} /> : f.status === 'ready' ? <Icon name="Check" size={16} color={th.accentStrong} /> : f.status === 'failed' ? <Icon name="Close" size={16} color={th.danger} /> : <ActivityIndicator size="small" color={th.muted} />}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: th.ink, fontSize: 14 }}>{f.name}</Text>
                      <Text style={{ color: f.status === 'failed' ? th.danger : th.muted, fontSize: 11.5 }}>
                        {f.status === 'failed' ? t('fileFailed') : f.status === 'ready' ? `${sizeText(f.size)}${f.addedAt ? ` · ${dateText(f.addedAt)}` : ''}` : t('fileProcessing')}
                      </Text>
                    </View>
                    <Pressable testID={`proj-file-del-${f.name}`} onPress={() => writeFiles(files.filter(x => x.fileId !== f.fileId))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('delete')}><Icon name="Trash" size={16} color={th.muted} /></Pressable>
                  </Pressable>))}
              </View>

              {files.length < PROJECT_FILES_MAX
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
                      <Pressable testID="proj-delete-confirm" onPress={() => { void useChat.getState().removeProject(open.id); setOpenId(null); setConfirming(false) }} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: th.danger }}><Text style={{ color: th.dangerInk, fontWeight: '700' }}>{t('delete')}</Text></Pressable>
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

        <Modal visible={!!actionsFor} transparent animationType="fade" onRequestClose={() => setActionsFor(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setActionsFor(null)} accessibilityLabel={t('close')}>
            <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text numberOfLines={1} style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingHorizontal: 8 }}>{actionsFor?.name}</Text>
              {!!actionsFor && act('proj-act-preview', t('projPreview'), 'Eye', () => void openPreview(actionsFor))}
              {!!actionsFor && act('proj-act-rename', t('projRename'), 'Edit', () => { setRenaming({ fileId: actionsFor.fileId, name: actionsFor.name }); setActionsFor(null) })}
              {!!actionsFor && act('proj-act-export', t('projExport'), 'Share', () => void exportFile(actionsFor))}
              {!!actionsFor && act('proj-act-copy', t('projCopyId'), 'Copy', () => { void Clipboard.setStringAsync(actionsFor.fileId); setActionsFor(null) })}
              {!!actionsFor && act('proj-act-delete', t('delete'), 'Trash', () => { writeFiles(files.filter(x => x.fileId !== actionsFor.fileId)); setActionsFor(null) }, true)}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 }} onPress={() => setPreview(null)} accessibilityLabel={t('close')}>
            <Pressable onPress={() => {}} style={{ backgroundColor: th.surface, borderRadius: 14, padding: 14, maxHeight: '80%' }}>
              <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '700', marginBottom: 8 }}>{preview?.name}</Text>
              {preview?.kind === 'image' && preview.uri ? <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 260 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                : preview?.kind === 'text' ? <ScrollView><Text selectable style={{ color: th.ink, fontSize: 13.5, lineHeight: 20 }}>{preview.text}</Text></ScrollView>
                  : <Text testID="proj-no-preview" style={{ color: th.muted, fontSize: 13 }}>{t('projNoPreview')}</Text>}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  )
}
