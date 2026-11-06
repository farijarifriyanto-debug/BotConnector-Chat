import React from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import { Icon } from './Icons'
import { useTheme } from '../theme/theme'
import { useT } from '../hooks/useT'

export function ConnectAiWelcome({ onConnect, onLocal }: { onConnect: () => void; onLocal: () => void }) {
  const th = useTheme(), t = useT()
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: 24, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
    <View style={{ paddingTop: 18 }}>
      <Image source={require('../../assets/bico/bico-hero.png')} accessibilityIgnoresInvertColors style={{ width: 86, height: 96, marginBottom: 20 }} resizeMode="contain" />
      <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 29, fontWeight: '600', letterSpacing: -0.8, lineHeight: 35 }}>{t('connectTitle')}</Text>
      <Text style={{ color: th.muted, fontSize: 15, lineHeight: 23, marginTop: 12, marginBottom: 26 }}>{t('connectBody')}</Text>
      <Pressable testID="empty-add-provider" accessibilityRole="button" onPress={onConnect} style={{ minHeight: 52, padding: 15, borderRadius: 14, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}><Text style={{ color: th.accentInk, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{t('connectAi')}</Text><Icon name="ChevR" color={th.accentInk} /></Pressable>
      <Text style={{ color: th.muted, textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 12 }}>{t('connectHint')}</Text>
      <Pressable testID="empty-add-local" accessibilityRole="button" onPress={onLocal} style={{ borderTopWidth: 1, borderColor: th.lineStrong, paddingVertical: 22, marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 13 }}><Icon name="Phone" color={th.ink} /><View style={{ flex: 1 }}><Text style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{t('connectLocal')}</Text><Text style={{ color: th.muted, fontSize: 12, lineHeight: 19, marginTop: 4 }}>{t('connectLocalHint')}</Text></View><Icon name="ChevR" color={th.muted} /></Pressable>
    </View>
    <Text style={{ color: th.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 'auto', paddingTop: 30, paddingBottom: 12 }}>{t('connectFooter')}</Text>
  </ScrollView>
}
