import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { BackupError } from '../lib/backup'
import {
  applyArchive,
  buildArchive,
  pickArchive,
  shareArchive,
  unpackArchiveBytes,
  writeArchiveFile,
  type PickedArchive,
} from '../lib/backupDevice'
import {
  downloadWebDavBackup,
  listWebDavBackups,
  testWebDavConnection,
  uploadWebDavBackup,
  type RemoteBackupItem,
  type WebDavConfig,
} from '../lib/backupRemote'
import Storage from 'expo-sqlite/kv-store'
import * as SecureStore from 'expo-secure-store'
import { listConvs } from '../db/convs'
import { useChat } from '../store/chat'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { SHOT, useShot } from '../lib/shot'

const WEBDAV_CFG_KEY = 'bc.webdav.cfg'
const WEBDAV_PASS_KEY = 'bc.webdav.pw'

/**
 * Backup and restore, following the reference app: one ZIP (or encrypted .kbackup) with a manifest,
 * its settings, the database and the picture folder. Supports local password encryption and
 * remote WebDAV sync.
 */
export function BackupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const scene = useShot(x => x.scene)
  const [tab, setTab] = useState<'local' | 'remote'>('local')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedArchive | null>(null)
  const [restart, setRestart] = useState<string | null>(null)

  // Encryption states
  const [encryptEnabled, setEncryptEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // Password prompt for importing encrypted backup
  const [promptOpen, setPromptOpen] = useState(false)
  const [importPassword, setImportPassword] = useState('')
  const [pendingDecrypt, setPendingDecrypt] = useState<((pw: string | null) => Promise<void>) | null>(null)

  // WebDAV remote states
  const [davUrl, setDavUrl] = useState('')
  const [davUser, setDavUser] = useState('')
  const [davPass, setDavPass] = useState('')
  const [davPath, setDavPath] = useState('')
  const [remoteFiles, setRemoteFiles] = useState<RemoteBackupItem[]>([])

  useEffect(() => {
    if (!visible) return
    try {
      const raw = Storage.getItemSync(WEBDAV_CFG_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WebDavConfig>
        if (parsed.url) setDavUrl(parsed.url)
        if (parsed.username) setDavUser(parsed.username)
        if (parsed.path) setDavPath(parsed.path)
      }
    } catch {
      // ignore
    }
    SecureStore.getItemAsync(WEBDAV_PASS_KEY).then(pw => {
      if (pw) setDavPass(pw)
    }).catch(() => {})
  }, [visible])

  const saveWebDavConfig = () => {
    try {
      Storage.setItemSync(WEBDAV_CFG_KEY, JSON.stringify({ url: davUrl, username: davUser, path: davPath }))
      if (davPass) {
        SecureStore.setItemAsync(WEBDAV_PASS_KEY, davPass).catch(() => {})
      }
    } catch {
      // ignore
    }
  }

  const getWebDavConfig = (): WebDavConfig => ({
    url: davUrl,
    username: davUser,
    password: davPass,
    path: davPath,
  })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const explain = (e: unknown) => {
    if (e instanceof BackupError && e.code === 'version') return t('bkVersion')
    if (e instanceof BackupError && e.code === 'decryption') return t('bkDecryptionFail')
    if (e instanceof BackupError) return t('bkFormat')
    if (e instanceof Error && e.message.includes('backup_decryption_failed')) return t('bkDecryptionFail')
    return t('bkApplyFail')
  }

  const exportNow = () => run(async () => {
    if (encryptEnabled) {
      if (!password) {
        setError(t('bkPasswordPrompt'))
        return
      }
      if (password !== passwordConfirm) {
        setError(t('bkPasswordMismatch'))
        return
      }
    }
    try {
      const archive = await buildArchive({ password: encryptEnabled ? password : undefined })
      const uri = await writeArchiveFile(archive.zip, archive.name)
      await shareArchive(uri)
      setNote(t('bkSaved', { n: archive.manifest.database.conversationCount }))
    } catch (e) {
      setError(explain(e) === t('bkApplyFail') ? t('bkFail') : explain(e))
    }
  })

  const importNow = () => run(async () => {
    try {
      const archive = await pickArchive({
        getPassword: () =>
          new Promise<string | null>(resolve => {
            setImportPassword('')
            setPendingDecrypt(() => async (pw: string | null) => {
              resolve(pw)
            })
            setPromptOpen(true)
          }),
      })
      if (archive) {
        setPicked(archive)
        setRestart(null)
        setNote(t('bkPicked', { n: archive.manifest.database.conversationCount }))
      }
    } catch (e) {
      if (!(e instanceof BackupError && e.code === 'cancel')) setError(explain(e))
    }
  })

  const handlePasswordSubmit = async () => {
    if (!importPassword) return
    const cb = pendingDecrypt
    setPromptOpen(false)
    setPendingDecrypt(null)
    if (cb) {
      await cb(importPassword)
    }
  }

  const apply = (mode: 'overwrite' | 'merge') => run(async () => {
    if (!picked) return
    try {
      if (mode === 'overwrite') {
        const safety = await buildArchive()
        await writeArchiveFile(
          safety.zip,
          safety.name.replace('botconnector-backup', 'botconnector-before-restore')
        )
      }
      const r = await applyArchive(picked, mode)
      useChat.setState({ convs: await listConvs() })
      setPicked(null)
      setRestart(t('bkRestart', { n: r.conversations }))
    } catch (e) {
      setError(explain(e))
    }
  })

  // Remote WebDAV actions
  const testRemote = () => run(async () => {
    saveWebDavConfig()
    const cfg = getWebDavConfig()
    if (!cfg.url) {
      setError(t('bkRemoteTestFail'))
      return
    }
    const res = await testWebDavConnection(cfg)
    if (res.ok) {
      setNote(t('bkRemoteTestOk'))
    } else {
      setError(`${t('bkRemoteTestFail')}: ${res.error || res.status || ''}`)
    }
  })

  const uploadRemote = () => run(async () => {
    saveWebDavConfig()
    const cfg = getWebDavConfig()
    if (!cfg.url) {
      setError(t('bkRemoteTestFail'))
      return
    }
    if (encryptEnabled) {
      if (!password) {
        setError(t('bkPasswordPrompt'))
        return
      }
      if (password !== passwordConfirm) {
        setError(t('bkPasswordMismatch'))
        return
      }
    }
    const archive = await buildArchive({ password: encryptEnabled ? password : undefined })
    await uploadWebDavBackup(cfg, archive.name, archive.zip)
    setNote(t('bkSaved', { n: archive.manifest.database.conversationCount }))
    await refreshRemoteList()
  })

  const refreshRemoteList = async () => {
    try {
      const cfg = getWebDavConfig()
      if (!cfg.url) return
      const list = await listWebDavBackups(cfg)
      setRemoteFiles(list)
    } catch {
      // ignore
    }
  }

  useEffect(() => { if (SHOT) { if (scene === 'backup-remote') { setTab('remote'); void refreshRemoteList() } else if (scene === 'backup') { setTab('local') } } }, [scene])   // screenshot build only

  const restoreRemoteItem = (item: RemoteBackupItem) => run(async () => {
    try {
      const cfg = getWebDavConfig()
      const bytes = await downloadWebDavBackup(cfg, item.name)
      const archive = await unpackArchiveBytes(bytes, {
        getPassword: () =>
          new Promise<string | null>(resolve => {
            setImportPassword('')
            setPendingDecrypt(() => async (pw: string | null) => {
              resolve(pw)
            })
            setPromptOpen(true)
          }),
      })
      setPicked(archive)
      setRestart(null)
      setNote(t('bkPicked', { n: archive.manifest.database.conversationCount }))
    } catch (e) {
      if (!(e instanceof BackupError && e.code === 'cancel')) setError(explain(e))
    }
  })

  const inputStyle = {
    borderWidth: 1,
    borderColor: th.lineStrong,
    borderRadius: 10,
    padding: 12,
    color: th.ink,
    backgroundColor: th.surface,
    fontSize: 15,
    marginTop: 8,
  }

  const button = (id: string, txt: string, onPress: () => void, primary = false) => (
    <Pressable
      testID={id}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={{
        padding: 14,
        borderRadius: 12,
        marginTop: 10,
        alignItems: 'center',
        backgroundColor: primary ? th.accent : th.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: th.lineStrong,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Text style={{ color: primary ? th.accentInk : th.ink, fontWeight: '700' }}>{txt}</Text>
    </Pressable>
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('bkTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="backup-close">
            <Icon name="Close" color={th.ink} />
          </Pressable>
        </View>

        {/* Tab Selector */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          <Pressable
            testID="backup-tab-local"
            onPress={() => setTab('local')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'local' }}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: tab === 'local' ? th.accent : th.surface,
            }}
          >
            <Text style={{ fontWeight: '700', color: tab === 'local' ? th.accentInk : th.ink }}>{t('bkLocalTab')}</Text>
          </Pressable>
          <Pressable
            testID="backup-tab-remote"
            onPress={() => {
              setTab('remote')
              void refreshRemoteList()
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'remote' }}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: tab === 'remote' ? th.accent : th.surface,
            }}
          >
            <Text style={{ fontWeight: '700', color: tab === 'remote' ? th.accentInk : th.ink }}>{t('bkRemoteTab')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {tab === 'local' ? (
            <>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('bkNote')}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{t('bkScope')}</Text>

              {/* Encryption options */}
              <View
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: th.surface,
                  borderWidth: 1,
                  borderColor: th.line,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: th.ink, fontWeight: '600', fontSize: 14 }}>{t('bkEncryptToggle')}</Text>
                  <Switch
                    testID="backup-encrypt-toggle"
                    value={encryptEnabled}
                    onValueChange={v => {
                      setEncryptEnabled(v)
                      if (!v) {
                        setPassword('')
                        setPasswordConfirm('')
                      }
                    }}
                    thumbColor={encryptEnabled ? th.accent : undefined}
                    accessibilityRole="switch"
                    accessibilityLabel={t('bkEncryptToggle')}
                  />
                </View>

                {encryptEnabled && (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      testID="backup-password-input"
                      style={inputStyle}
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t('bkPassword')}
                      placeholderTextColor={th.muted2}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <TextInput
                      testID="backup-password-confirm"
                      style={inputStyle}
                      value={passwordConfirm}
                      onChangeText={setPasswordConfirm}
                      placeholder={t('bkPasswordConfirm')}
                      placeholderTextColor={th.muted2}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  </View>
                )}
              </View>

              {button('backup-export', t('bkExport'), exportNow, true)}
              {button('backup-import', t('bkImport'), importNow)}
            </>
          ) : (
            <>
              {/* Remote WebDAV Tab */}
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('bkRemoteTab')}</Text>

              <TextInput
                testID="webdav-url-input"
                style={inputStyle}
                value={davUrl}
                onChangeText={setDavUrl}
                onBlur={saveWebDavConfig}
                placeholder={t('bkRemoteUrl')}
                placeholderTextColor={th.muted2}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TextInput
                testID="webdav-user-input"
                style={inputStyle}
                value={davUser}
                onChangeText={setDavUser}
                onBlur={saveWebDavConfig}
                placeholder={t('bkRemoteUser')}
                placeholderTextColor={th.muted2}
                autoCapitalize="none"
              />
              <TextInput
                testID="webdav-pass-input"
                style={inputStyle}
                value={davPass}
                onChangeText={setDavPass}
                onBlur={saveWebDavConfig}
                placeholder={t('bkRemotePass')}
                placeholderTextColor={th.muted2}
                secureTextEntry
                autoCapitalize="none"
              />
              <TextInput
                testID="webdav-path-input"
                style={inputStyle}
                value={davPath}
                onChangeText={setDavPath}
                onBlur={saveWebDavConfig}
                placeholder={t('bkRemotePath')}
                placeholderTextColor={th.muted2}
                autoCapitalize="none"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  testID="webdav-test-btn"
                  onPress={testRemote}
                  disabled={busy}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: th.surface,
                    borderWidth: 1,
                    borderColor: th.lineStrong,
                  }}
                >
                  <Text style={{ color: th.ink, fontWeight: '600' }}>{t('bkRemoteTest')}</Text>
                </Pressable>
                <Pressable
                  testID="webdav-upload-btn"
                  onPress={uploadRemote}
                  disabled={busy}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: th.accent,
                  }}
                >
                  <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('bkRemoteUpload')}</Text>
                </Pressable>
              </View>

              {/* Remote file list */}
              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: th.ink, fontWeight: '700', fontSize: 15 }}>{t('bkRemoteList')}</Text>
                  <Pressable testID="webdav-refresh-btn" onPress={() => void refreshRemoteList()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('bkRemoteRefresh')}>
                    <Icon name="ArrowLeftRight" size={16} color={th.muted} />
                  </Pressable>
                </View>

                {remoteFiles.length === 0 ? (
                  <Text style={{ color: th.muted2, fontSize: 13, marginTop: 8 }}>{t('bkRemoteNoFiles')}</Text>
                ) : (
                  remoteFiles.map(file => (
                    <View
                      key={file.name}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: th.line,
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: th.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                          {file.name}
                        </Text>
                        <Text style={{ color: th.muted2, fontSize: 11, marginTop: 2 }}>
                          {Math.round(file.size / 1024)} KB · {file.lastModified}
                        </Text>
                      </View>
                      <Pressable
                        testID={`restore-remote-${file.name}`}
                        onPress={() => restoreRemoteItem(file)}
                        accessibilityRole="button"
                        hitSlop={6}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: th.surface,
                          borderWidth: 1,
                          borderColor: th.lineStrong,
                        }}
                      >
                        <Text style={{ color: th.ink, fontSize: 12, fontWeight: '600' }}>
                          {t('bkRemoteRestore')}
                        </Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </>
          )}

          {busy && <ActivityIndicator testID="backup-busy" color={th.muted} style={{ marginTop: 14 }} />}

          {/* Overwrite or Merge confirmation modal */}
          {!!picked && (
            <View
              testID="backup-mode"
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: th.lineStrong,
                backgroundColor: th.surface,
              }}
            >
              <Text style={{ color: th.ink, fontWeight: '700' }}>{t('bkPickMode')}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 4 }}>{t('bkOverwriteNote')}</Text>
              <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 4 }}>{t('bkMergeNote')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  testID="backup-overwrite"
                  onPress={() => void apply('overwrite')}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 11,
                    borderRadius: 10,
                    backgroundColor: th.danger,
                  }}
                >
                  <Text style={{ color: th.dangerInk, fontWeight: '700' }}>{t('bkOverwrite')}</Text>
                </Pressable>
                <Pressable
                  testID="backup-merge"
                  onPress={() => void apply('merge')}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: th.lineStrong,
                  }}
                >
                  <Text style={{ color: th.ink, fontWeight: '600' }}>{t('bkMerge')}</Text>
                </Pressable>
              </View>
              <Pressable
                testID="backup-cancel"
                onPress={() => setPicked(null)}
                accessibilityRole="button"
                style={{ marginTop: 10, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: th.muted, fontWeight: '600' }}>{t('cancel')}</Text>
              </Pressable>
            </View>
          )}

          {/* Decryption password prompt dialog */}
          {promptOpen && (
            <View
              testID="backup-password-prompt"
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: th.accent,
                backgroundColor: th.surface,
              }}
            >
              <Text style={{ color: th.ink, fontWeight: '700' }}>{t('bkPasswordPrompt')}</Text>
              <TextInput
                testID="import-password-input"
                style={inputStyle}
                value={importPassword}
                onChangeText={setImportPassword}
                placeholder={t('bkPassword')}
                placeholderTextColor={th.muted2}
                secureTextEntry
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  testID="import-password-submit"
                  onPress={handlePasswordSubmit}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: th.accent,
                  }}
                >
                  <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('done')}</Text>
                </Pressable>
                <Pressable
                  testID="import-password-cancel"
                  onPress={() => {
                    setPromptOpen(false)
                    const settle = pendingDecrypt
                    setPendingDecrypt(null)
                    if (settle) void settle(null)   // resolve the awaited getPassword promise so the busy state clears
                  }}
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: th.lineStrong,
                  }}
                >
                  <Text style={{ color: th.ink, fontWeight: '600' }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!!note && <Text testID="backup-note" style={{ color: th.accentStrong, fontSize: 13, marginTop: 14 }}>{note}</Text>}
          {!!restart && <Text testID="backup-restart" style={{ color: th.accentStrong, fontSize: 13, marginTop: 14 }}>{restart}</Text>}
          {!!error && <Text testID="backup-error" accessibilityRole="alert" style={{ color: th.danger, fontSize: 13, marginTop: 14 }}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  )
}
