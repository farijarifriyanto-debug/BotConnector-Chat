import React from 'react'
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native'
import { useSettings } from '../store/settings'

export const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const
/** Applies the user's text size on top of the style: only sizes that are set explicitly are scaled, so nested text keeps inheriting its parent's. */
export function scaleStyle<S>(style: S, k: number): S | (S | { fontSize?: number; lineHeight?: number })[] {
  if (k === 1) return style
  const f = StyleSheet.flatten(style as never) as { fontSize?: number; lineHeight?: number } | undefined
  if (!f || f.fontSize === undefined) return style
  return [style, { fontSize: f.fontSize * k, ...(f.lineHeight !== undefined ? { lineHeight: f.lineHeight * k } : {}) }]
}
export function Text({ style, ...rest }: TextProps) {
  const k = useSettings(s => s.fontScale)
  return <RNText {...rest} style={scaleStyle(style, k) as TextProps['style']} />
}
export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const k = useSettings(s => s.fontScale)
  return <RNTextInput ref={ref} {...rest} style={scaleStyle(style, k) as TextInputProps['style']} />
})
