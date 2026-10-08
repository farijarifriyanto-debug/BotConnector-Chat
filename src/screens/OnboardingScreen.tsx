import Storage from 'expo-sqlite/kv-store'
import React, { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Text } from '../components/Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'

const KEY = 'bc.onboarded.v1'
export const seenOnboarding = (): boolean => { try { return Storage.getItemSync(KEY) === '1' } catch { return true } }   // an unreadable store must never trap the user in the intro
const markSeen = () => { try { Storage.setItemSync(KEY, '1') } catch { /* shown again next time */ } }
const SLIDES = [['ob1Title', 'ob1Body'], ['ob2Title', 'ob2Body'], ['ob3Title', 'ob3Body']] as const

/** Three short pages shown once, right after the first sign-in. */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const th = useTheme(), t = useT(), { width } = useWindowDimensions(), [page, setPage] = useState(0), ref = useRef<ScrollView>(null)
  const last = page === SLIDES.length - 1
  const finish = () => { markSeen(); onDone() }
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
      <View style={{ alignItems: 'flex-end', padding: 12 }}><Pressable testID="ob-skip" onPress={finish} hitSlop={10} accessibilityRole="button"><Text style={{ color: th.muted, fontWeight: '600' }}>{t('obSkip')}</Text></Pressable></View>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flex: 1 }}>
        {SLIDES.map(([title, body]) => (
          <View key={title} style={{ width, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={require('../../assets/bico/bico-hero.png')} style={{ width: 150, height: 150 }} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text accessibilityRole="header" style={{ color: th.ink, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 16 }}>{t(title)}</Text>
            <Text style={{ color: th.muted, fontSize: 15.5, lineHeight: 23, textAlign: 'center', marginTop: 10 }}>{t(body)}</Text>
          </View>))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 }}>{SLIDES.map((_, i) => <View key={i} style={{ width: i === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? th.accent : th.surface3 }} />)}</View>
      <Pressable testID="ob-next" onPress={() => (last ? finish() : ref.current?.scrollTo({ x: (page + 1) * width, animated: true }))} accessibilityRole="button" style={{ marginHorizontal: 24, marginBottom: 16, padding: 15, borderRadius: 14, backgroundColor: th.accent, alignItems: 'center' }}><Text style={{ color: th.accentInk, fontSize: 16, fontWeight: '700' }}>{t(last ? 'obStart' : 'obNext')}</Text></Pressable>
    </SafeAreaView>
  )
}
