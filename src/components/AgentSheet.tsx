// Drive a coding-agent session (bccli) running on the user's paired computer.
// Flow: pick an online computer -> pick a session or start one in a folder -> chat + approvals.
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from 'react-native'
import { listDevices, type Device } from '../laptop/api'
import { sessions as listSessions, workspaces as listWorkspaces, start as startSession, type AgentSessionSummary, type AgentWorkspace } from '../agent/api'
import { attachStream, useAgent } from '../agent/store'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { Markdown } from './Markdown'
import { Text } from './Text'

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** Device/agent codes that already have a localized sentence; anything else falls back to `errDevice`. */
const AGENT_ERROR_KEYS: Record<string, string> = {
  agent_runtime_missing: 'errAgentRuntime',
  agent_busy: 'errAgentBusy',
  agent_unsupported: 'errAgentUnsupported',
  agent_timeout: 'errAgentTimeout',
  device_offline: 'errDeviceOffline',
  device_timeout: 'errDeviceTimeout',
}

export function AgentSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme()
  const t = useT()
  const agent = useAgent()
  const [devices, setDevices] = useState<Device[]>([])
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([])
  const [folders, setFolders] = useState<AgentWorkspace[]>([])
  const [device, setDevice] = useState<string | null>(null)
  const [step, setStep] = useState<'device' | 'pick' | 'session'>('device')
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)

  const fail = (e: unknown) => setLocalErr((e as { code?: string })?.code ?? 'device_error')

  useEffect(() => {
    if (!visible) return
    let alive = true
    void (async () => {
      // Dijalankan setelah satu microtask: hindari setState sinkron di dalam effect.
      await Promise.resolve()
      if (!alive) return
      setLocalErr(null)
      setStep(agent.sessionId ? 'session' : 'device')
      setBusy(true)
      try {
        const all = await listDevices()
        if (alive) setDevices(all.filter((d) => d.online))
      } catch (e) {
        if (alive) fail(e)
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Stream dibuka/ditutup oleh effect, bukan dari handler render, supaya tidak menyentuh ref saat render.
  useEffect(() => {
    if (!visible || step !== 'session' || !agent.sessionId) return
    const ac = new AbortController()
    void attachStream(ac.signal)
    return () => ac.abort()
  }, [visible, step, agent.sessionId])

  async function pickDevice(id: string) {
    setDevice(id)
    setBusy(true)
    setLocalErr(null)
    try {
      const [list, spaces] = await Promise.all([listSessions(id).catch(() => []), listWorkspaces(id).catch(() => [])])
      setSessions(Array.isArray(list) ? list : [])
      setFolders(Array.isArray(spaces) ? spaces : [])
      setStep('pick')
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  async function open(id: string, cwd?: string) {
    if (!device) return
    setBusy(true)
    setLocalErr(null)
    try {
      await agent.open(device, id, cwd)
      setStep('session')
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  async function create(cwd: string) {
    if (!device) return
    setBusy(true)
    try {
      await open(await startSession(device, cwd), cwd)
    } catch (e) {
      fail(e)
      setBusy(false)
    }
  }

  const row = (key: string, label: string, sub: string | undefined, onPress: () => void, testID?: string) => (
    <Pressable key={key} testID={testID} onPress={onPress} accessibilityRole="button" style={{ marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
      <Text style={{ color: th.ink, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  )

  const errorText = localErr ?? agent.error
  const errorKey = errorText ? (AGENT_ERROR_KEYS[errorText] ?? 'errDevice') : null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('agent')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="agent-close">
            <Icon name="Close" color={th.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {errorKey ? (
            <Text accessibilityRole="alert" testID="agent-error" style={{ color: th.danger, marginBottom: 10 }}>
              {t(errorKey as never)}
            </Text>
          ) : null}

          {step === 'device' ? (
            <>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('agentNote')}</Text>
              {busy ? <ActivityIndicator style={{ marginTop: 16 }} testID="agent-busy" /> : null}
              {!busy && devices.length === 0 ? (
                <Text style={{ color: th.muted, marginTop: 16, fontSize: 13 }} testID="agent-no-device">
                  {t('agentNone')}
                </Text>
              ) : null}
              {devices.map((d) => row(d.id, d.name, d.platform, () => void pickDevice(d.id), `agent-device-${d.id}`))}
            </>
          ) : null}

          {step === 'pick' ? (
            <>
              <Text style={{ color: th.muted, fontSize: 13 }}>{t('agentSessions')}</Text>
              {sessions.map((s) => row(s.id, s.preview || s.id, s.mtime ? new Date(s.mtime).toLocaleString() : undefined, () => void open(s.id), `agent-session-${s.id}`))}
              {sessions.length === 0 && !busy ? (
                <Text style={{ color: th.muted, marginTop: 10, fontSize: 13 }} testID="agent-no-session">
                  {t('agentNoSessions')}
                </Text>
              ) : null}
              <Text style={{ color: th.muted, fontSize: 13, marginTop: 22 }}>{t('agentNew')}</Text>
              {folders.map((f) => row(f.path, f.name || f.path, f.path, () => void create(f.path), `agent-folder-${f.path}`))}
            </>
          ) : null}

          {step === 'session' ? (
            <>
              {agent.baseline.map((m, i) => (
                <View key={`b${i}`} style={{ marginTop: 10 }} testID={`agent-baseline-${i}`}>
                  <Text style={{ color: th.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.role}</Text>
                  {typeof m.content === 'string' ? <Markdown text={m.content} /> : null}
                </View>
              ))}
              {agent.items.map((item, i) => {
                const key = `i${i}`
                switch (item.type) {
                  case 'text':
                    return isText(item.delta) ? <Markdown key={key} text={String(item.delta)} /> : null
                  case 'thinking':
                    return (
                      <Text key={key} style={{ color: th.muted, fontStyle: 'italic', marginTop: 6 }} numberOfLines={4}>
                        {String(item.delta ?? '')}
                      </Text>
                    )
                  case 'tool_use':
                    return (
                      <View key={key} testID={`tool-use-${i}`} style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: th.surface, borderWidth: 1, borderColor: th.line }}>
                        <Text style={{ color: th.ink, fontWeight: '600', fontSize: 12 }}>
                          {String(item.tool ?? 'tool')} · {String(item.target ?? '')}
                        </Text>
                      </View>
                    )
                  case 'tool_result':
                    return (
                      <View key={key} testID={`tool-result-${i}`} style={{ marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: th.surface, borderWidth: 1, borderColor: item.isError ? th.danger : th.line }}>
                        {isText(item.display) ? (
                          <Text style={{ color: th.ink, fontSize: 12, fontFamily: 'monospace' }} numberOfLines={12}>
                            {String(item.display)}
                          </Text>
                        ) : (
                          <Text style={{ color: th.muted, fontSize: 12 }} numberOfLines={4}>
                            {String(item.output ?? '')}
                          </Text>
                        )}
                      </View>
                    )
                  default:
                    return null
                }
              })}

              {agent.pending ? (
                <View testID="agent-approval" style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
                  <Text style={{ color: th.ink, fontWeight: '700' }}>{t('agentWants').replace('{tool}', agent.pending.tool)}</Text>
                  {agent.pending.target ? (
                    <Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{agent.pending.target}</Text>
                  ) : null}
                  {isText(agent.pending.diff) || isText(agent.pending.preview) ? (
                    <Text style={{ color: th.ink, fontSize: 12, fontFamily: 'monospace', marginTop: 8 }} numberOfLines={10}>
                      {String(agent.pending.diff ?? agent.pending.preview)}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable testID="agent-allow" onPress={() => void agent.answer('yes')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: th.accent, alignItems: 'center' }}>
                      <Text style={{ color: th.accentInk, fontWeight: '700', fontSize: 13 }}>{t('agentAllowOnce')}</Text>
                    </Pressable>
                    <Pressable testID="agent-allow-session" onPress={() => void agent.answer('session')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center' }}>
                      <Text style={{ color: th.ink, fontWeight: '600', fontSize: 13 }}>{t('agentAllowSession')}</Text>
                    </Pressable>
                    <Pressable testID="agent-deny" onPress={() => void agent.answer('no')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: th.danger, alignItems: 'center' }}>
                      <Text style={{ color: th.danger, fontWeight: '600', fontSize: 13 }}>{t('agentDeny')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 }}>
                <TextInput
                  testID="agent-input"
                  value={input}
                  onChangeText={setInput}
                  placeholder={t('agentPromptPh')}
                  placeholderTextColor={th.muted2}
                  style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.line, color: th.ink, backgroundColor: th.surface }}
                  onSubmitEditing={() => {
                    const text = input.trim()
                    if (!text) return
                    setInput('')
                    void agent.send(text)
                  }}
                  returnKeyType="send"
                />
                {agent.turn === 'running' ? (
                  <Pressable testID="agent-stop" onPress={() => void agent.stop()} accessibilityRole="button" style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.danger }}>
                    <Text style={{ color: th.danger, fontWeight: '700' }}>{t('agentStop')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}
