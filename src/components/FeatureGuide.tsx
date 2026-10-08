import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon, type IconName } from './Icons'

export interface Feature { icon: IconName; title: 'fgAttach' | 'fgWeb' | 'fgResearch' | 'fgImage' | 'fgModel'; body: 'fgAttachBody' | 'fgWebBody' | 'fgResearchBody' | 'fgImageBody' | 'fgModelBody' }
/** The buttons under the message box, explained with the same icons, so a new user knows what the app can do. */
export function FeatureGuide({ features }: { features: Feature[] }) {
  const th = useTheme(), t = useT()
  if (!features.length) return null
  return (
    <View testID="feature-guide" style={{ alignSelf: 'stretch', maxWidth: 420, marginTop: 26 }}>
      <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{t('fgTitle')}</Text>
      {features.map(f => (
        <View key={f.title} testID={`feature-${f.title}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={f.icon} size={17} color={th.muted} /></View>
          <View style={{ flex: 1 }}><Text style={{ color: th.ink, fontWeight: '700', fontSize: 14.5 }}>{t(f.title)}</Text><Text style={{ color: th.muted, fontSize: 13, lineHeight: 18.5, marginTop: 2 }}>{t(f.body)}</Text></View>
        </View>))}
    </View>
  )
}
