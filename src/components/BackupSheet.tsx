import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { useT } from '../hooks/useT'
import { BackupError } from '../lib/backup'
import { applyArchive, buildArchive, pickArchive, shareArchive, writeArchiveFile, type PickedArchive } from '../lib/backupDevice'
import { listConvs } from '../db/convs'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/**
 * Backup and restore, following the reference app: one ZIP with a manifest, its settings, the
 * database and the picture folder. Restore offers overwrite or merge, writes a safety archive
 * before replacing everything, and asks for a restart so settings and keys take effect.
 */
export function BackupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const [busy, setBusy] = useState(false), [note, setNote] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedArchive | null>(null), [restart, setRestart] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setNote(null)
    try { await fn() } finally { setBusy(false) }
  }
  const explain = (e: unknown) => {
    if (e instanceof BackupError && e.code === 'version') return t('bkVersion')
    if (e instanceof BackupError) return t('bkFormat')
    return t('bkApplyFail')
  }

  const exportNow = () => run(async () => {
    try {
      const archive = await buildArchive()
      const uri = await writeArchiveFile(archive.zip, archive.name)
      await shareArchive(uri)
      setNote(t('bkSaved', { n: archive.manifest.database.conversationCount }))
    } catch (e) { setError(explain(e) === t('bkApplyFail') ? t('bkFail') : explain(e)) }
  })

  const importNow = () => run(async () => {
    try {
      const archive = await pickArchive()
      if (archive) { setPicked(archive); setRestart(null); setNote(t('bkPicked', { n: archive.manifest.database.conversationCount })) }
    } catch (e) { setError(e instanceof BackupError && e.code === 'version' ? t('bkVersion') : t('bkFormat')) }
  })

  const apply = (mode: 'overwrite' | 'merge') => run(async () => {
    if (!picked) return
    try {
      if (mode === 'overwrite') {
        const safety = await buildArchive()
        await writeArchiveFile(safety.zip, safety.name.replace('botconnector-backup', 'botconnector-before-restore'))
      }
      const r = await applyArchive(picked, mode)
      useChat.setState({ convs: await listConvs() })
      setPicked(null)
      setRestart(t('bkRestart', { n: r.conversations }))
    } catch (e) { setError(explain(e)) }
  })

  const button = (id: string, txt: string, onPress: () => void, primary = false) => (
    <Pressable testID={id} onPress={onPress} disabled={busy} accessibilityRole="button" style={{ padding: 14, borderRadius: 12, marginTop: 10, alignItems: 'center', backgroundColor: primary ? th.accent : th.surface, borderWidth: primary ? 0 : 1, borderColor: th.lineStrong, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: primary ? th.accentInk : th.ink, fontWeight: '700' }}>{txt}</Text>
    </Pressable>)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('bkTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="backup-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('bkNote')}</Text>
          <Text style={{ color: th.muted2, fontSize: 12.5, marginTop: 6 }}>{t('bkScope')}</Text>

          {button('backup-export', t('bkExport'), exportNow, true)}
          {button('backup-import', t('bkImport'), importNow)}
          {busy && <ActivityIndicator color={th.muted} style={{ marginTop: 14 }} />}

          {!!picked && (
            <View testID="backup-mode" style={{ marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
              <Text style={{ color: th.ink, fontWeight: '700' }}>{t('bkPickMode')}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 4 }}>{t('bkOverwriteNote')}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 4 }}>{t('bkMergeNote')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable testID="backup-overwrite" onPress={() => void apply('overwrite')} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: th.danger }}><Text style={{ color: '#fff', fontWeight: '700' }}>{t('bkOverwrite')}</Text></Pressable>
                <Pressable testID="backup-merge" onPress={() => void apply('merge')} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('bkMerge')}</Text></Pressable>
              </View>
              <Pressable testID="backup-cancel" onPress={() => setPicked(null)} accessibilityRole="button" style={{ marginTop: 10, alignItems: 'center' }}><Text style={{ color: th.muted, fontWeight: '600' }}>{t('cancel')}</Text></Pressable>
            </View>)}

          {!!note && <Text testID="backup-note" style={{ color: th.accentStrong, fontSize: 13, marginTop: 14 }}>{note}</Text>}
          {!!restart && <Text testID="backup-restart" style={{ color: th.accentStrong, fontSize: 13, marginTop: 14 }}>{restart}</Text>}
          {!!error && <Text testID="backup-error" accessibilityRole="alert" style={{ color: th.danger, fontSize: 13, marginTop: 14 }}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  )
}
