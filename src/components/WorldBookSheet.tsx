import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useT } from '../hooks/useT'
import { LORE_POSITIONS, splitKeywords, type LoreEntry, type LorePosition } from '../lib/worldbook'
import { useWorldBook } from '../store/worldbook'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/**
 * World Book: books of keyword-triggered notes. Only switched-on books are searched, and
 * only the entries whose keywords appear in recent messages are injected (see lib/worldbook).
 */
export function WorldBookSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  const books = useWorldBook(s => s.books), active = useWorldBook(s => s.active)
  const [bookId, setBookId] = useState<string | null>(null)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [name, setName] = useState(''), [keywords, setKeywords] = useState(''), [content, setContent] = useState('')
  const [priority, setPriority] = useState('0'), [scan, setScan] = useState('4'), [depth, setDepth] = useState('4')

  const book = books.find(b => b.id === bookId)
  const entry = book?.entries.find(e => e.id === entryId)

  useEffect(() => { if (!visible) { setBookId(null); setEntryId(null) } }, [visible])
  useEffect(() => { if (bookId && !books.some(b => b.id === bookId)) { setBookId(null); setEntryId(null) } }, [bookId, books])
  const openEntry = (e: LoreEntry) => {
    setEntryId(e.id); setName(e.name); setKeywords(e.keywords.join(', ')); setContent(e.content)
    setPriority(String(e.priority)); setScan(String(e.scanDepth)); setDepth(String(e.injectDepth))
  }
  const saveEntry = () => {
    if (!book || !entry) return
    const num = (v: string, min: number, max: number, fallback: number) => {
      const n = Number.parseInt(v, 10)
      return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback
    }
    useWorldBook.getState().updateEntry(book.id, entry.id, {
      name: name.slice(0, 120), keywords: splitKeywords(keywords).slice(0, 50), content: content.slice(0, 20_000),
      priority: num(priority, -999, 999, 0), scanDepth: num(scan, 1, 200, 4), injectDepth: num(depth, 0, 200, 4),
    })
    setEntryId(null)
  }
  const startBook = (id: string) => { setBookId(id); setEntryId(null) }
  const input = { borderWidth: 1, borderColor: th.lineStrong, borderRadius: 10, padding: 12, color: th.ink, backgroundColor: th.surface, fontSize: 16 } as const
  const label = (txt: string) => <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>{txt}</Text>
  const seg = <T extends string>(value: T, items: { v: T; label: string }[], set: (v: T) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map(i => (
        <Pressable key={i.v} testID={`lore-seg-${i.v}`} onPress={() => set(i.v)} accessibilityRole="button" accessibilityState={{ selected: value === i.v }}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: value === i.v ? th.accentStrong : th.lineStrong, backgroundColor: value === i.v ? th.accentSoft : 'transparent' }}>
          <Text style={{ color: value === i.v ? th.accentStrong : th.ink, fontSize: 13, fontWeight: value === i.v ? '700' : '400' }}>{i.label}</Text>
        </Pressable>))}
    </View>
  )
  const posLabel: Record<LorePosition, string> = { afterSystem: t('lorePosAfter'), beforeSystem: t('lorePosBefore'), topOfChat: t('lorePosTop'), bottomOfChat: t('lorePosBottom'), atDepth: t('lorePosDepth') }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            {(bookId || entryId) && <Pressable onPress={() => (entryId ? saveEntry() : setBookId(null))} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('back')} testID="lore-back"><Icon name="ChevL" color={th.ink} /></Pressable>}
            <Text numberOfLines={1} style={{ color: th.ink, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{t('loreTitle')}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('done')} testID="lore-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!book && (
            <>
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t('loreNote')}</Text>
              {books.length === 0 && <Text testID="lore-empty" style={{ color: th.muted, marginTop: 16 }}>{t('loreBooksEmpty')}</Text>}
              {books.map(b => {
                const on = active.includes(b.id)
                return (
                  <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: on ? th.lineStrong : th.line, backgroundColor: th.surface }}>
                    <Pressable testID={`lore-book-${b.id}`} onPress={() => startBook(b.id)} accessibilityRole="button" style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{b.name.trim() || t('loreUntitled')}</Text>
                      <Text style={{ color: th.muted, fontSize: 12.5, marginTop: 3 }}>{t('loreEntriesCount', { n: b.entries.length })}</Text>
                    </Pressable>
                    <Pressable testID={`lore-book-toggle-${b.id}`} onPress={() => useWorldBook.getState().toggleBook(b.id)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={b.name.trim() || t('loreUntitled')}
                      style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: on ? th.accentStrong : th.lineStrong, backgroundColor: on ? th.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="Check" size={15} color={th.accentStrong} />}
                    </Pressable>
                  </View>)
              })}
              <Pressable testID="lore-add-book" onPress={() => startBook(useWorldBook.getState().addBook(''))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
                <Icon name="Plus" size={16} color={th.ink} /><Text style={{ color: th.ink, fontWeight: '600' }}>{t('loreAddBook')}</Text>
              </Pressable>
            </>
          )}

          {book && !entry && (
            <>
              {label(t('loreBookName'))}
              <TextInput testID="lore-book-name" style={input} value={book.name} onChangeText={v => useWorldBook.getState().updateBook(book.id, { name: v.slice(0, 120) })} placeholder={t('loreBookNamePh')} placeholderTextColor={th.muted2} maxLength={120} />
              {book.entries.length === 0 && <Text testID="lore-entries-empty" style={{ color: th.muted, marginTop: 16 }}>{t('loreEntriesEmpty')}</Text>}
              {book.entries.map(e => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: th.line, backgroundColor: th.surface }}>
                  <Pressable testID={`lore-entry-${e.id}`} onPress={() => openEntry(e)} accessibilityRole="button" style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: th.ink, fontWeight: '600' }}>{e.name.trim() || e.content.trim().split('\n')[0] || t('loreUntitled')}</Text>
                    <Text numberOfLines={1} style={{ color: th.muted, fontSize: 12.5, marginTop: 3 }}>{e.constantActive ? t('loreAlwaysOn') : e.keywords.join(', ') || t('loreNoKeywords')}</Text>
                  </Pressable>
                  <Pressable testID={`lore-entry-toggle-${e.id}`} onPress={() => useWorldBook.getState().updateEntry(book.id, e.id, { enabled: !e.enabled })} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: e.enabled }} accessibilityLabel={e.name.trim() || t('loreUntitled')}
                    style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: e.enabled ? th.accentStrong : th.lineStrong, backgroundColor: e.enabled ? th.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {e.enabled && <Icon name="Check" size={15} color={th.accentStrong} />}
                  </Pressable>
                </View>))}
              <Pressable testID="lore-add-entry" onPress={() => { const id = useWorldBook.getState().addEntry(book.id); const created = useWorldBook.getState().books.find(b => b.id === book.id)?.entries.find(x => x.id === id); if (created) openEntry(created) }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong }}>
                <Icon name="Plus" size={16} color={th.ink} /><Text style={{ color: th.ink, fontWeight: '600' }}>{t('loreAddEntry')}</Text>
              </Pressable>
              <Pressable testID="lore-remove-book" onPress={() => useWorldBook.getState().removeBook(book.id)} accessibilityRole="button" style={{ marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: th.line }}>
                <Text style={{ color: th.danger, fontWeight: '600' }}>{t('loreRemoveBook')}</Text>
              </Pressable>
            </>
          )}

          {book && entry && (
            <>
              {label(t('loreEntryName'))}
              <TextInput testID="lore-entry-name" style={input} value={name} onChangeText={setName} placeholder={t('loreEntryNamePh')} placeholderTextColor={th.muted2} maxLength={120} />
              {label(t('loreKeywords'))}
              <TextInput testID="lore-keywords" style={input} value={keywords} onChangeText={setKeywords} placeholder={t('loreKeywordsPh')} placeholderTextColor={th.muted2} />
              {label(t('loreContent'))}
              <TextInput testID="lore-content" style={[input, { minHeight: 140, textAlignVertical: 'top' }]} value={content} onChangeText={setContent} multiline placeholder={t('loreContentPh')} placeholderTextColor={th.muted2} maxLength={20_000} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('loreAlwaysOn')}</Text>
                <Switch testID="lore-always" value={entry.constantActive} onValueChange={v => useWorldBook.getState().updateEntry(book.id, entry.id, { constantActive: v })} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: th.ink, flex: 1, paddingRight: 10 }}>{t('loreCase')}</Text>
                <Switch testID="lore-case" value={entry.caseSensitive} onValueChange={v => useWorldBook.getState().updateEntry(book.id, entry.id, { caseSensitive: v })} />
              </View>
              {label(t('lorePosition'))}
              {seg<LorePosition>(entry.position, LORE_POSITIONS.map(p => ({ v: p, label: posLabel[p] })), v => useWorldBook.getState().updateEntry(book.id, entry.id, { position: v }))}
              {entry.position === 'atDepth' && (
                <>
                  {label(t('loreInjectDepth'))}
                  <TextInput testID="lore-depth" style={input} value={depth} onChangeText={setDepth} keyboardType="number-pad" />
                </>
              )}
              {label(t('loreRole'))}
              {seg<'user' | 'assistant'>(entry.role, [{ v: 'user', label: t('loreRoleUser') }, { v: 'assistant', label: t('loreRoleAssistant') }], v => useWorldBook.getState().updateEntry(book.id, entry.id, { role: v }))}
              {label(t('loreScan'))}
              <TextInput testID="lore-scan" style={input} value={scan} onChangeText={setScan} keyboardType="number-pad" />
              {label(t('lorePriority'))}
              <TextInput testID="lore-priority" style={input} value={priority} onChangeText={setPriority} keyboardType="numbers-and-punctuation" />
              <Pressable testID="lore-save" onPress={saveEntry} accessibilityRole="button" style={{ marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: th.accent }}>
                <Text style={{ color: th.accentInk, fontWeight: '700' }}>{t('save')}</Text>
              </Pressable>
              <Pressable testID="lore-remove-entry" onPress={() => { useWorldBook.getState().removeEntry(book.id, entry.id); setEntryId(null) }} accessibilityRole="button" style={{ marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: th.line }}>
                <Text style={{ color: th.danger, fontWeight: '600' }}>{t('remove')}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}
