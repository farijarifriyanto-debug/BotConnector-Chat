import React, { useEffect, useRef, useState } from 'react'
import { Alert, Animated, FlatList, Image, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useT } from '../hooks/useT'
import { groupByDay } from '../lib/conv'
import type { Conv } from '../lib/types'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

interface Props { open: boolean; convs: Conv[]; activeId: string | null; onClose: () => void; onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onSettings: () => void }
type Row = { kind: 'head'; key: string; label: string } | { kind: 'conv'; key: string; conv: Conv }

/** Slide-in chat history. Grouped by day like the web; long-press a chat to delete it. */
export function Sidebar({ open, convs, activeId, onClose, onNew, onOpen, onDelete, onSettings }: Props) {
  const th = useTheme(), t = useT(), { width } = useWindowDimensions()
  const w = Math.min(width * 0.84, 340), x = useRef(new Animated.Value(-w)).current
  const [shown, setShown] = useState(open), [query, setQuery] = useState('')
  useEffect(() => {
    if (open) setShown(true)
    Animated.timing(x, { toValue: open ? 0 : -w, duration: 220, useNativeDriver: true }).start(() => { if (!open) setShown(false) })
  }, [open, w, x])
  if (!shown) return null
  const q = query.trim().toLowerCase()
  const list = convs.filter(c => !c.kind && !c.archived && c.messages.length > 0 && (!q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q))))
  const rows: Row[] = []
  const pinned = list.filter(c => c.pinned), rest = list.filter(c => !c.pinned)
  if (pinned.length) { rows.push({ kind: 'head', key: 'h-pin', label: t('pinned') }); pinned.forEach(c => rows.push({ kind: 'conv', key: c.id, conv: c })) }
  for (const g of groupByDay(rest)) { rows.push({ kind: 'head', key: 'h-' + g.key, label: t(g.key) }); g.items.forEach(i => rows.push({ kind: 'conv', key: rest[i].id, conv: rest[i] })) }
  const confirmDelete = (c: Conv) => Alert.alert(t('deleteChatQ'), c.title || t('untitled'), [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: () => onDelete(c.id) }])
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 }} pointerEvents="box-none">
      <Pressable accessibilityLabel={t('close')} onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w, transform: [{ translateX: x }], backgroundColor: th.surface, borderRightWidth: 1, borderColor: th.line }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
            <Image source={require('../../assets/bico/bico-mark.png')} style={{ width: 28, height: 28 }} accessibilityIgnoresInvertColors />
            <Text style={{ color: th.ink, fontSize: 17, fontWeight: '700', flex: 1 }}>{t('appTitle')}</Text>
            <Pressable testID="sidebar-new" onPress={() => { onNew(); onClose() }} accessibilityRole="button" accessibilityLabel={t('newChat')} hitSlop={10} style={{ padding: 6, borderRadius: 10, borderWidth: 1, borderColor: th.lineStrong }}><Icon name="Plus" size={18} color={th.ink} /></Pressable>
          </View>
          <View style={{ marginHorizontal: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: th.lineStrong, borderRadius: 12, paddingHorizontal: 10, backgroundColor: th.surface2 }}>
            <Icon name="Search" size={16} color={th.muted2} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t('search')} placeholderTextColor={th.muted2} style={{ flex: 1, color: th.ink, paddingVertical: 9, fontSize: 15 }} />
          </View>
          <FlatList data={rows} keyExtractor={r => r.key} contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={<Text style={{ color: th.muted, textAlign: 'center', marginTop: 24 }}>{q ? t('noMatches') : t('noChats')}</Text>}
            renderItem={({ item }) => item.kind === 'head'
              ? <Text style={{ color: th.muted2, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4, marginHorizontal: 16 }}>{item.label}</Text>
              : <Pressable testID={`conv-${item.conv.id}`} onPress={() => { onOpen(item.conv.id); onClose() }} onLongPress={() => confirmDelete(item.conv)} accessibilityRole="button" accessibilityState={{ selected: item.conv.id === activeId }}
                  style={{ marginHorizontal: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: item.conv.id === activeId ? th.accentSoft : undefined }}>
                  <Text numberOfLines={1} style={{ color: th.ink, fontSize: 15, fontWeight: item.conv.id === activeId ? '700' : '400' }}>{item.conv.title || t('untitled')}</Text>
                </Pressable>} />
          <Pressable testID="sidebar-settings" onPress={() => { onSettings(); onClose() }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1, borderColor: th.line }}><Icon name="User" size={18} color={th.muted} /><Text style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{t('settings')}</Text></Pressable>
        </SafeAreaView>
      </Animated.View>
    </View>
  )
}
