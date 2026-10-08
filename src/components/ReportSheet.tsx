import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { Icon } from './Icons'
import { useT } from '../hooks/useT'
import { REASONS, ReportError, reportMailto, sendReport, type Reason, type Report } from '../lib/report'
import type { Msg } from '../lib/types'
import { useAuth } from '../store/auth'
import { useTheme } from '../theme/theme'

const KEY = { harmful: 'rpHarmful', sexual: 'rpSexual', hate: 'rpHate', wrong: 'rpWrong', privacy: 'rpPrivacy', other: 'rpOther' } as const
const ERR = { rate: 'rpErrRate', invalid: 'rpErrInvalid', down: 'rpErrDown', network: 'rpErrNet' } as const

/** Report a reply to the BotConnector team. It sends only this reply, the question before it and the model name, never the rest of the chat. */
export function ReportSheet({ msg, prompt, onClose }: { msg: Msg | null; prompt: string; onClose: () => void }) {
  const th = useTheme(), t = useT(), account = useAuth(a => a.account)
  const [reason, setReason] = useState<Reason | null>(null), [note, setNote] = useState(''), [withPrompt, setWithPrompt] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle'), [ref, setRef] = useState(''), [err, setErr] = useState<keyof typeof ERR | null>(null)
  const email = account?.email ?? ''
  const close = () => { setReason(null); setNote(''); setWithPrompt(true); setState('idle'); setErr(null); setRef(''); onClose() }
  const report = (): Report | null => msg && reason ? { reason, note, reply: msg.content, prompt: withPrompt ? prompt : '', model: msg.image?.model || msg.model || '', hasImage: !!msg.attachments?.some(a => a.kind === 'image'), app: Platform.OS } : null
  const submit = async () => {
    const r = report(); if (!r || state === 'sending') return
    setState('sending'); setErr(null)
    try { setRef(await sendReport({ name: account?.display_name || email.split('@')[0] || 'BotConnector app', email }, r)); setState('done') }
    catch (e) { setErr(e instanceof ReportError ? e.reason : 'down'); setState('idle') }
  }
  const mail = () => { const r = report(); if (r) void Linking.openURL(reportMailto(r)).catch(() => {}) }
  const btn = { padding: 14, borderRadius: 12, alignItems: 'center' as const }
  return (
    <Modal visible={!!msg} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('rpTitle')}</Text>
          <Pressable testID="report-close" onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        {state === 'done' ? (
          <View testID="report-done" style={{ padding: 20, gap: 10 }}>
            <Icon name="Check" size={28} color={th.accentStrong} />
            <Text style={{ color: th.ink, fontSize: 16, fontWeight: '700' }}>{t('rpThanks')}</Text>
            {!!ref && <Text style={{ color: th.muted }}>{t('rpRef', { r: ref })}</Text>}
            <Pressable testID="report-ok" onPress={close} accessibilityRole="button" style={[btn, { backgroundColor: th.accent, marginTop: 10 }]}><Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('rpDone')}</Text></Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('rpIntro')}</Text>
            <View style={{ marginTop: 14, gap: 8 }}>
              {REASONS.map(r => { const on = reason === r; return (
                <Pressable key={r} testID={`reason-${r}`} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? th.accent : th.muted2, alignItems: 'center', justifyContent: 'center' }}>{on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.accent }} />}</View>
                  <Text style={{ color: th.ink, fontSize: 15, flex: 1 }}>{t(KEY[r])}</Text>
                </Pressable>) })}
            </View>
            <TextInput testID="report-note" value={note} onChangeText={setNote} multiline maxLength={500} placeholder={t('rpNote')} placeholderTextColor={th.muted2} style={{ marginTop: 14, minHeight: 72, borderWidth: 1, borderColor: th.lineStrong, borderRadius: 12, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 15, textAlignVertical: 'top' }} />
            {!!prompt && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}><Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('rpWithPrompt')}</Text><Switch testID="report-prompt" value={withPrompt} onValueChange={setWithPrompt} /></View>}
            <Text style={{ color: th.muted2, fontSize: 12, marginTop: 10 }}>{t('rpSends')}</Text>
            {!!err && <Text testID="report-error" accessibilityRole="alert" style={{ color: th.danger, marginTop: 12 }}>{t(ERR[err])}</Text>}
            {!!email && (
              <Pressable testID="report-send" onPress={() => void submit()} disabled={!reason || state === 'sending'} accessibilityRole="button" accessibilityState={{ disabled: !reason || state === 'sending', busy: state === 'sending' }} style={[btn, { marginTop: 16, backgroundColor: reason ? th.accent : th.surface3 }]}>
                {state === 'sending' ? <ActivityIndicator color={th.accentInk} /> : <Text style={{ color: reason ? th.accentInk : th.muted2, fontWeight: '700' }}>{t('rpSend')}</Text>}
              </Pressable>)}
            {(!email || !!err) && (
              <Pressable testID="report-mail" onPress={mail} disabled={!reason} accessibilityRole="button" accessibilityState={{ disabled: !reason }} style={[btn, { marginTop: 10, borderWidth: 1, borderColor: th.lineStrong, opacity: reason ? 1 : 0.5 }]}><Text style={{ color: th.ink, fontWeight: '600' }}>{t('rpMail')}</Text></Pressable>)}
          </ScrollView>)}
      </KeyboardAvoidingView>
    </Modal>
  )
}
