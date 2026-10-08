import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Composer } from '../components/Composer'
import { Icon } from '../components/Icons'
import { MessageView } from '../components/MessageView'
import { ModelSheet } from '../components/ModelSheet'
import { SettingsSheet } from '../components/SettingsSheet'
import { Sidebar } from '../components/Sidebar'
import { useT } from '../hooks/useT'
import { currentConv, useChat } from '../store/chat'
import type { ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'

const STARTERS = ['s1', 's2', 's3', 's4'] as const

export function ChatScreen() {
  const th = useTheme(), t = useT()
  const chat = useChat(), conv = useChat(currentConv)
  const [imgSheet, setImgSheet] = useState(false), [menu, setMenu] = useState(false), [models, setModels] = useState(false), [settings, setSettings] = useState(false)
  const list = useRef<FlatList>(null)
  const msgs = conv?.messages ?? []
  const model = chat.models.find(m => m.id === chat.modelId)
  const web = chat.caps?.web !== false
  const lastAssistant = useMemo(() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') return msgs[i].id; return null }, [msgs])
  useEffect(() => { void chat.init() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const opts = { web, research: false }
  const last = msgs[msgs.length - 1]
  useEffect(() => { if (msgs.length) list.current?.scrollToEnd({ animated: true }) }, [msgs.length, last?.content.length])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 48 }}>
        <Pressable testID="open-menu" onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('menu')}><Icon name="MenuIcon" size={22} color={th.ink} /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: th.ink, fontSize: 16, fontWeight: '700' }}>{conv?.title || t('newChat')}</Text>
        <Pressable testID="header-model" onPress={() => setModels(true)} accessibilityRole="button" accessibilityLabel={t('menuModel')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150, height: 34, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface }}>
          <Text numberOfLines={1} style={{ color: th.ink, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{model?.name ?? t('model')}</Text><Icon name="Chevron" size={14} color={th.muted} />
        </Pressable>
        <Pressable testID="header-new" onPress={() => chat.newChat()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('newChat')}><Icon name="Plus" size={22} color={th.ink} /></Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {msgs.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <Image source={require('../../assets/bico/bico-mark.png')} style={{ width: 64, height: 64 }} accessibilityIgnoresInvertColors />
            <Text style={{ color: th.ink, fontSize: 22, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>{t('emptyTitle')}</Text>
            <Text style={{ color: th.muted, fontSize: 14.5, marginTop: 6, textAlign: 'center' }}>{t('emptySub')}</Text>
            {chat.modelsState === 'error' && <Pressable testID="models-retry" onPress={() => void chat.loadModels()} accessibilityRole="button" style={{ marginTop: 14 }}><Text style={{ color: th.danger, textAlign: 'center' }}>{t('modelsError')} {t('retry')}</Text></Pressable>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 22, alignSelf: 'stretch', maxWidth: 420 }}>
              {STARTERS.map(k => <Pressable key={k} testID={`starter-${k}`} onPress={() => void chat.send(t(k), opts)} disabled={!model} accessibilityRole="button" style={{ width: '48.5%', minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface, opacity: model ? 1 : 0.5 }}><Text style={{ color: th.ink, fontSize: 14, textAlign: 'center' }}>{t(k)}</Text></Pressable>)}
            </View>
          </View>
        ) : (
          <FlatList ref={list} data={msgs} keyExtractor={m => m.id} contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            renderItem={({ item }) => <MessageView msg={item} streaming={chat.busy && item.id === last?.id && item.role === 'assistant'} status={chat.busy && item.id === last?.id ? chat.status : null} isLastAssistant={item.id === lastAssistant} canAct={!chat.busy} onRegenerate={() => void chat.regenerate(opts)} />} />
        )}
        <Composer busy={chat.busy} model={model} webAvailable={web} onSend={(text, o) => void chat.send(text, o)} onStop={chat.stop} image={{ available: chat.imageModels.length > 0, modelName: chat.imageModels.find(m => m.id === chat.imageModelId)?.name ?? '', onPick: () => setImgSheet(true) }} />
      </KeyboardAvoidingView>
      <Sidebar open={menu} convs={chat.convs} activeId={chat.activeId} onClose={() => setMenu(false)} onNew={chat.newChat} onOpen={chat.open} onDelete={id => void chat.remove(id)} onSettings={() => setSettings(true)} />
      <ModelSheet visible={models} models={chat.models} selected={chat.modelId} onSelect={id => { chat.selectModel(id); setModels(false) }} onClose={() => setModels(false)} />
      <ModelSheet visible={imgSheet} models={chat.imageModels.map((m): ChatModel => ({ id: m.id, name: m.name, access: m.access, vision: false, tools: false, reasoning: false, available: true }))} selected={chat.imageModelId} onSelect={chat.selectImageModel} onClose={() => setImgSheet(false)} />
      <SettingsSheet visible={settings} onClose={() => setSettings(false)} />
    </SafeAreaView>
  )
}
