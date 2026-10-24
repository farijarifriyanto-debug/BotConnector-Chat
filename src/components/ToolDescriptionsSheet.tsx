import React, { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { TOOLS } from '../lib/agent'
import { cleanOverride, describeParams, isModified, type ToolDef, type ToolOverride } from '../lib/toolSchema'
import { useToolSchema } from '../store/toolSchema'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const GROUP: Record<string, 'search'> = { web_search: 'search', read_url: 'search' }
const tools: ToolDef[] = TOOLS as ToolDef[]

/**
 * Tool Descriptions: rewrite the wording the model reads for the built-in tools. Names,
 * parameters and required lists stay exactly as shipped (see lib/toolSchema).
 */
export function ToolDescriptionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const [draft, setDraft] = useState<Record<string, ToolOverride>>({})

  useEffect(() => { if (visible) setDraft(useToolSchema.getState().tools) }, [visible])
  // Typing is kept locally and handed to the store once it settles, like the reference app's debounce.
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => useToolSchema.getState().replaceAll(draft), 400)
    return () => clearTimeout(id)
  }, [draft, visible])

  const params = useMemo(() => Object.fromEntries(tools.map(d => [d.function.name, describeParams(d)])), [])
  const setDescription = (name: string, text: string) => setDraft(d => {
    const next = { ...d, [name]: { ...(d[name] ?? {}), description: text } }
    if (!cleanOverride(next[name])) delete next[name]
    return next
  })
  const setParam = (name: string, path: string, text: string) => setDraft(d => {
    const next = { ...d, [name]: { ...(d[name] ?? {}), params: { ...(d[name]?.params ?? {}), [path]: text } } }
    if (!cleanOverride(next[name])) delete next[name]
    return next
  })
  const reset = (name: string) => setDraft(d => { const next = { ...d }; delete next[name]; return next })

  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 15 } as const
  const groups = ['search'] as const

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('toolTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('done')} testID="tools-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('toolNote')}</Text>
          {groups.map(group => (
            <View key={group}>
              <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20 }}>{t('toolGroupSearch')}</Text>
              {tools.filter(d => GROUP[d.function.name] === group).map(def => {
                const name = def.function.name
                const o = draft[name]
                const modified = isModified(def, o)
                return (
                  <View key={name} testID={`tool-${name}`} style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: modified ? th.lineStrong : th.line, backgroundColor: th.surface }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: th.ink, fontWeight: '700', fontSize: 14 }}>{name}</Text>
                      {modified && (
                        <View testID={`tool-modified-${name}`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: th.accentSoft }}>
                          <Text style={{ color: th.accentStrong, fontSize: 11, fontWeight: '700' }}>{t('toolModified')}</Text>
                        </View>)}
                      <View style={{ flex: 1 }} />
                      {modified && (
                        <Pressable testID={`tool-reset-${name}`} onPress={() => reset(name)} hitSlop={8} accessibilityRole="button">
                          <Text style={{ color: th.accentStrong, fontSize: 12.5, fontWeight: '600' }}>{t('toolRestore')}</Text>
                        </Pressable>)}
                    </View>
                    <Text style={{ color: th.muted2, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 }}>{t('toolDescription')}</Text>
                    <TextInput testID={`tool-desc-${name}`} style={[input, { minHeight: 88, textAlignVertical: 'top' }]} multiline
                      value={o?.description ?? def.function.description} placeholder={def.function.description} placeholderTextColor={th.muted2}
                      onChangeText={v => setDescription(name, v)} maxLength={2000} />
                    {params[name].map(p => (
                      <View key={p.path}>
                        <Text style={{ color: th.muted2, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginTop: 10, marginBottom: 6 }}>{p.path}{p.type ? ` · ${p.type}` : ''}</Text>
                        <TextInput testID={`tool-param-${name}-${p.path}`} style={input} value={o?.params?.[p.path] ?? p.defaultDescription ?? ''}
                          placeholder={p.defaultDescription ?? ''} placeholderTextColor={th.muted2} onChangeText={v => setParam(name, p.path, v)} maxLength={2000} />
                      </View>
                    ))}
                  </View>)
              })}
            </View>))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
