import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { agentSessions, agentStart, agentWorkspaces } from '../agent/api'
import { useLaptop } from '../laptop/store'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { Text } from './Text'

export type AgentTarget = { deviceId: string; sessionId: string; cwd: string | null }

const basename = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p
const codeOf = (e: unknown): string => { const c = (e as { code?: string })?.code; return typeof c === 'string' && c ? c : 'unavailable' }

/** Pick a paired computer, then an existing agent session or a new one in a folder. */
export function AgentSheet({ visible, onClose, onOpenSession }: { visible: boolean; onClose: () => void; onOpenSession: (target: AgentTarget) => void }) {
  const th = useTheme(), t = useT(), { entries } = useLaptop()
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<{ id: string; preview?: string }[]>([])
  const [workspaces, setWorkspaces] = useState<{ path: string; name?: string }[]>([])
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setDeviceId(null); setSessions([]); setWorkspaces([]); setPicking(false); setError(null)
    void useLaptop.getState().refresh()
  }, [visible])

  const capable = (d: { online: boolean; capabilities?: string[] }) => d.online && Array.isArray(d.capabilities) && d.capabilities.includes('agent.start')
  const fail = (e: unknown) => setError(codeOf(e))

  const openDevice = async (id: string) => {
    setDeviceId(id); setPicking(false); setLoading(true); setError(null)
    try { setSessions(await agentSessions(id, null)) } catch (e) { fail(e) } finally { setLoading(false) }
  }
  const beginNew = async () => {
    if (!deviceId) return
    setPicking(true); setLoading(true); setError(null)
    try { setWorkspaces(await agentWorkspaces(deviceId)) } catch (e) { fail(e) } finally { setLoading(false) }
  }
  const start = async (path: string) => {
    if (!deviceId) return
    setLoading(true); setError(null)
    try {
      const { sessionId } = await agentStart(deviceId, path)
      onOpenSession({ deviceId, sessionId, cwd: path })
      onClose()
    } catch (e) { fail(e) } finally { setLoading(false) }
  }

  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 }}>{txt}</Text>
  const rowStyle = { padding: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 }
  const errorText = error === 'agent_capacity' ? t('agentErrCapacity') : error === 'agent_runtime_missing' ? t('agentErrRuntime') : error === 'agent_unsupported' ? t('agentErrUnsupported') : error === 'device_offline' ? t('agentErrOffline') : t('agentErrGeneric')

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('agent')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('agentClose')} testID="agent-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('agentNote')}</Text>
          {label(t('agentDevices'))}
          {entries.length === 0 && <Text testID="agent-no-devices" style={{ color: th.muted }}>{t('agentNoDevices')}</Text>}
          {entries.map(({ device }) => {
            const ok = capable(device)
            return (
              <Pressable
                key={device.id}
                testID={`agent-device-${device.name}`}
                disabled={!ok}
                onPress={() => void openDevice(device.id)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ok }}
                style={{ ...rowStyle, opacity: ok ? 1 : 0.55 }}
              >
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: ok ? '#22c55e' : th.muted2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.ink, fontWeight: '700', fontSize: 15 }}>{device.name}</Text>
                  {!ok && <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 3 }}>{t('agentUpdateCli')} · {t('agentUpdateCliHint')}</Text>}
                </View>
                {ok && <Icon name="Chevron" size={16} color={th.muted} />}
              </Pressable>
            )
          })}
          {!!error && <Text testID="agent-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 10 }}>{errorText}</Text>}
          {!!deviceId && !picking && (
            <>
              {label(t('agentSessions'))}
              {loading && <ActivityIndicator color={th.muted} />}
              {!loading && sessions.length === 0 && <Text style={{ color: th.muted }}>{t('agentNoSessions')}</Text>}
              {sessions.map(s => (
                <Pressable key={s.id} testID={`agent-session-${s.id}`} onPress={() => onOpenSession({ deviceId, sessionId: s.id, cwd: null })} accessibilityRole="button" style={rowStyle}>
                  <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontSize: 14 }}>{s.preview || s.id}</Text></View>
                  <Icon name="Chevron" size={16} color={th.muted} />
                </Pressable>
              ))}
              <Pressable testID="agent-new" onPress={() => void beginNew()} disabled={loading} accessibilityRole="button" style={{ marginTop: 6, padding: 14, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center' }}>
                <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('agentNew')}</Text>
              </Pressable>
            </>
          )}
          {!!deviceId && picking && (
            <>
              {label(t('agentWorkspaces'))}
              {loading && <ActivityIndicator color={th.muted} />}
              {!loading && workspaces.length === 0 && <Text style={{ color: th.muted }}>{t('agentNoWorkspaces')}</Text>}
              {workspaces.map(w => (
                <Pressable key={w.path} testID={`agent-workspace-${basename(w.path)}`} onPress={() => void start(w.path)} disabled={loading} accessibilityRole="button" style={rowStyle}>
                  <Icon name="Folder" size={18} color={th.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.ink, fontSize: 14 }}>{w.name || basename(w.path)}</Text>
                    <Text numberOfLines={1} style={{ color: th.muted2, fontSize: 12 }}>{w.path}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}
