import React, { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useT } from '../hooks/useT'
import type { ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

interface Props {
  busy: boolean; model: ChatModel | undefined; webAvailable: boolean; onSend: (text: string, o: { web: boolean; research: boolean }) => void; onStop: () => void; onPickModel: () => void
}

/** Message box with the same pills as the web Chat: Web search, Deep research (one answer), model. */
export function Composer({ busy, model, webAvailable, onSend, onStop, onPickModel }: Props) {
  const th = useTheme(), t = useT()
  const [text, setText] = useState(''), [web, setWeb] = useState(false), [research, setResearch] = useState(false)
  const can = !busy && !!model && text.trim().length > 0
  const submit = () => { if (!can) return; onSend(text, { web: web || research, research }); setText(''); setResearch(false) }   // Deep research is for one answer, like the web
  const pill = (on: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 11, height: 34, borderRadius: 17, borderWidth: 1, borderColor: on ? th.accent : th.lineStrong, backgroundColor: on ? th.accentSoft : th.surface })
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: th.bg }}>
      {research && <Text accessibilityRole="text" style={{ color: th.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{t('researchNote')}</Text>}
      <View style={{ borderWidth: 1, borderColor: th.lineStrong, borderRadius: 22, backgroundColor: th.surface, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
        <TextInput testID="composer-input" value={text} onChangeText={setText} multiline placeholder={t(research ? 'researchPlaceholder' : 'placeholder')} placeholderTextColor={th.muted2}
          style={{ color: th.ink, fontSize: 16, lineHeight: 22, maxHeight: 150, minHeight: 24, paddingTop: 0, paddingBottom: 6 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {webAvailable && <Pressable testID="pill-web" accessibilityRole="button" accessibilityState={{ selected: web }} onPress={() => setWeb(v => !v)} style={pill(web)}><Icon name="Globe" size={16} color={web ? th.accentStrong : th.muted} /><Text style={{ color: web ? th.accentStrong : th.muted, fontSize: 13, fontWeight: '600' }}>{t('web')}</Text></Pressable>}
          {webAvailable && <Pressable testID="pill-research" accessibilityRole="button" accessibilityState={{ selected: research }} onPress={() => setResearch(v => !v)} style={pill(research)}><Icon name="Research" size={16} color={research ? th.accentStrong : th.muted} /><Text style={{ color: research ? th.accentStrong : th.muted, fontSize: 13, fontWeight: '600' }}>{t('researchPill')}</Text></Pressable>}
          <View style={{ flex: 1 }} />
          <Pressable testID="pill-model" accessibilityRole="button" onPress={onPickModel} style={[pill(false), { maxWidth: 150 }]}><Text numberOfLines={1} style={{ color: th.ink, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{model?.name ?? t('model')}</Text><Icon name="Chevron" size={14} color={th.muted} /></Pressable>
          {busy
            ? <Pressable testID="send-stop" accessibilityRole="button" accessibilityLabel={t('stop')} onPress={onStop} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: th.ink, alignItems: 'center', justifyContent: 'center' }}><Icon name="Stop" size={16} color={th.bg} /></Pressable>
            : <Pressable testID="send-go" accessibilityRole="button" accessibilityLabel={t('send')} accessibilityState={{ disabled: !can }} disabled={!can} onPress={submit} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: can ? th.accent : th.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="Send" size={18} color={can ? th.accentInk : th.muted2} /></Pressable>}
        </View>
      </View>
    </View>
  )
}
