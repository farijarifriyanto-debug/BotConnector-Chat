import React, { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, TextInput, View } from 'react-native'
import type { AgentEntry } from '../agent/types'
import { useAgent } from '../agent/store'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { Markdown } from './Markdown'
import { Text } from './Text'

const ERROR_KEY: Record<string, string> = {
  agent_runtime_missing: 'agentErrRuntime',
  agent_not_configured: 'agentErrNotConfigured',
  agent_unsupported: 'agentErrUnsupported',
  agent_busy: 'agentErrBusy',
  agent_capacity: 'agentErrCapacity',
  device_offline: 'agentErrOffline',
  device_timeout: 'agentErrTimeout',
  stalled: 'agentErrTimeout',
  auth: 'agentErrAuth',
}

/** Live agent session: transcript, approval card, composer and per-turn usage. */
export function AgentSessionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const view = useAgent(s => s.view), busy = useAgent(s => s.busy), attached = useAgent(s => s.attached)
  const [draft, setDraft] = useState('')
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({})

  useEffect(() => { if (visible && !attached) void useAgent.getState().restore() }, [visible, attached])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (await useAgent.getState().send(text)) setDraft('')
  }

  const errorCopy = view.error ? t((ERROR_KEY[view.error] ?? 'agentErrGeneric') as never) : null
  const mono = { fontFamily: 'Courier', fontSize: 12.5, color: th.ink } as const

  const renderEntry = (e: AgentEntry) => {
    if (e.kind === 'user') {
      return (
        <View key={e.id} testID={`agent-entry-${e.id}`} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: th.accentSoft, padding: 10, borderRadius: 12, marginTop: 8 }}>
          <Text style={{ color: th.ink }}>{e.text}</Text>
        </View>
      )
    }
    if (e.kind === 'thinking') {
      const open = openThinking[e.id] === true
      return (
        <Pressable key={e.id} testID={`agent-thinking-${e.id}`} onPress={() => setOpenThinking(v => ({ ...v, [e.id]: !open }))} accessibilityRole="button" style={{ marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: th.surface }}>
          <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700' }}>{t('agentThinking')} {open ? '−' : '+'}</Text>
          {open && <Text style={{ color: th.muted, fontSize: 13, marginTop: 6 }}>{e.text}</Text>}
        </Pressable>
      )
    }
    if (e.kind === 'tool') {
      const stateKey = e.status === 'running' ? 'agentToolRunning' : e.status === 'error' ? 'agentToolError' : 'agentToolOk'
      return (
        <View key={e.id} testID={`agent-tool-${e.id}`} style={{ marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={e.status === 'error' ? 'Close' : 'Pencil'} size={14} color={e.status === 'error' ? th.danger : th.muted} />
            <Text style={{ color: th.ink, fontWeight: '700', fontSize: 13 }}>{e.tool}</Text>
            {!!e.target && <Text numberOfLines={1} style={{ color: th.muted2, fontSize: 12, flex: 1 }}>{e.target}</Text>}
            <Text style={{ color: e.status === 'error' ? th.danger : th.muted2, fontSize: 12 }}>{t(stateKey as never)}</Text>
          </View>
          {!!e.output && <Text numberOfLines={3} style={{ color: th.muted, fontSize: 12.5, marginTop: 6 }}>{e.output}</Text>}
          {!!e.display && (
            <View testID={`agent-diff-${e.id}`} style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: th.bg }}>
              <Text style={{ color: th.muted2, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>{t('agentDiff')}</Text>
              <Text style={mono}>{e.display}</Text>
            </View>
          )}
        </View>
      )
    }
    if (e.kind === 'error') {
      return <Text key={e.id} style={{ color: th.danger, marginTop: 8 }}>{e.text || t('agentErrGeneric')}</Text>
    }
    if (e.kind === 'result') {
      return <View key={e.id} style={{ marginTop: 8 }}><Markdown text={e.text} /></View>
    }
    return <View key={e.id} style={{ marginTop: 8 }}><Markdown text={e.text} /></View>
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('agent')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('agentClose')} testID="agent-session-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView testID="agent-session" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text style={{ color: th.muted2, fontSize: 12, lineHeight: 17 }}>{t('agentPrivacy')}</Text>
          {view.omitted > 0 && <Text style={{ color: th.muted2, fontSize: 12, marginTop: 8 }}>{t('agentTruncated', { n: view.omitted })}</Text>}
          {view.entries.map(renderEntry)}
          {!!errorCopy && (
            <View testID="agent-error" style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: th.surface }}>
              <Text accessibilityRole="alert" style={{ color: th.danger }}>{errorCopy}</Text>
              <Pressable testID="agent-retry" onPress={() => void useAgent.getState().restore()} accessibilityRole="button" style={{ marginTop: 8 }}>
                <Text style={{ color: th.accentStrong, fontWeight: '700' }}>{t('agentRetry')}</Text>
              </Pressable>
            </View>
          )}
          {!!view.pending && (
            <View testID="agent-approval" style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
              <Text style={{ color: th.ink, fontWeight: '700' }}>{t('agentApproval')}</Text>
              <Text style={{ color: th.muted, fontSize: 13, marginTop: 4 }}>
                {view.pending.tool || 'tool'}{view.pending.target ? ` · ${view.pending.target}` : ''}
              </Text>
              {!!view.pending.preview && (
                <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: th.bg }}>
                  <Text style={{ color: th.muted2, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>{t('agentDiff')}</Text>
                  <Text style={mono}>{view.pending.preview}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable testID="agent-approve-yes" disabled={busy} onPress={() => void useAgent.getState().approve('yes')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: th.accent, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ color: th.accentInk, fontWeight: '700', fontSize: 13 }}>{t('agentAllow')}</Text>
                </Pressable>
                <Pressable testID="agent-approve-session" disabled={busy} onPress={() => void useAgent.getState().approve('session')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ color: th.ink, fontWeight: '700', fontSize: 13 }}>{t('agentAllowSession')}</Text>
                </Pressable>
                <Pressable testID="agent-approve-no" disabled={busy} onPress={() => void useAgent.getState().approve('no')} accessibilityRole="button" style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ color: th.danger, fontWeight: '700', fontSize: 13 }}>{t('agentDeny')}</Text>
                </Pressable>
              </View>
            </View>
          )}
          {view.turn !== 'idle' && <ActivityIndicator color={th.muted} style={{ alignSelf: 'flex-start', marginTop: 12 }} />}
        </ScrollView>
        {!!view.usage && (
          <Text testID="agent-usage" style={{ color: th.muted2, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 }}>
            {t('agentUsage', { i: view.usage.inputTokens ?? 0, o: view.usage.outputTokens ?? 0 })}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: th.line }}>
          <TextInput
            testID="agent-composer"
            value={draft}
            onChangeText={setDraft}
            placeholder={t('agentComposer')}
            placeholderTextColor={th.muted2}
            multiline
            style={{ flex: 1, minHeight: 42, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: th.line, color: th.ink, backgroundColor: th.surface }}
          />
          {view.turn !== 'idle' && (
            <Pressable testID="agent-cancel" onPress={() => void useAgent.getState().cancelTurn()} accessibilityRole="button" style={{ padding: 11, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
              <Text style={{ color: th.ink, fontWeight: '700', fontSize: 13 }}>{t('agentCancelTurn')}</Text>
            </Pressable>
          )}
          <Pressable testID="agent-send" onPress={() => void send()} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityState={{ disabled: busy || !draft.trim() }} style={{ padding: 11, borderRadius: 12, backgroundColor: th.accent, opacity: busy || !draft.trim() ? 0.5 : 1 }}>
            <Icon name="Send" size={18} color={th.accentInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
