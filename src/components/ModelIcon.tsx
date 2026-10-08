import React, { memo, useMemo } from 'react'
import { Image, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { Text } from './Text'
import { BRAND_SVG } from '../lib/brandIcons'
import { modelBrand } from '../lib/modelPicker'
import type { ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'

/** The family's own mark (Claude, Gemini, GPT, Qwen…) in a small tile; BotConnector's Bico for Auto; the first letter when the family is unknown. Decorative: the name is always written next to it. */
function ModelIconBase({ model, size = 32 }: { model: Pick<ChatModel, 'id' | 'name' | 'provider' | 'access'>; size?: number }) {
  const th = useTheme(), brand = modelBrand(model)
  const xml = useMemo(() => (brand ? BRAND_SVG[brand].replace(/currentColor/g, th.ink) : null), [brand, th.ink])
  const tile = { width: size, height: size, borderRadius: Math.round(size * 0.28), alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: th.surface3, overflow: 'hidden' as const }
  return (
    <View testID={`icon-${brand ?? (model.access === 'auto' ? 'bico' : 'letter')}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={tile}>
      {xml ? <SvgXml xml={xml} width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} />
        : model.access === 'auto' ? <Image source={require('../../assets/bico/bico-mark.png')} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" accessibilityIgnoresInvertColors />
        : <Text style={{ color: th.muted, fontSize: Math.round(size * 0.42), fontWeight: '700' }}>{(model.name.trim()[0] ?? '?').toUpperCase()}</Text>}
    </View>
  )
}
export const ModelIcon = memo(ModelIconBase)
