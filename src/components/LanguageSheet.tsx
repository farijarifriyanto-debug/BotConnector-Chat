import React from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useT } from '../hooks/useT'
import { LANGUAGES } from '../i18n/langs'
import { useSettings } from '../store/settings'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'
import { Text } from './Text'

/** Pick the app language. Names are written in their own language so they can be found from any other one. */
export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT(), lang = useSettings(s => s.lang), setLang = useSettings(s => s.setLang)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('language')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="language-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {LANGUAGES.map(l => (
            <Pressable key={l.code} testID={`lang-${l.code}`} accessibilityRole="radio" accessibilityState={{ selected: lang === l.code }} onPress={() => { setLang(l.code); onClose() }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: lang === l.code ? th.accent : th.line, backgroundColor: lang === l.code ? th.accentSoft : th.surface }}>
              <Text style={{ flex: 1, color: th.ink, fontSize: 16, fontWeight: lang === l.code ? '700' : '500' }}>{l.name}</Text>
              {lang === l.code && <Icon name="Check" size={18} color={th.accentStrong} />}
            </Pressable>))}
        </ScrollView>
      </View>
    </Modal>
  )
}
