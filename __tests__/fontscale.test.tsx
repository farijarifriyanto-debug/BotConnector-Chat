import './helpers/mocks'
import { render } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import { scaleStyle, Text } from '../src/components/Text'
import { useSettings } from '../src/store/settings'

describe('text size', () => {
  it('scales only explicit sizes, keeps nested text inheriting, and does nothing at 100%', () => {
    expect(scaleStyle({ fontSize: 16, lineHeight: 20, color: 'x' }, 1)).toEqual({ fontSize: 16, lineHeight: 20, color: 'x' })
    const flat = StyleSheet.flatten(scaleStyle({ fontSize: 16, lineHeight: 20, color: 'x' }, 1.5) as never) as Record<string, unknown>
    expect(flat).toMatchObject({ fontSize: 24, lineHeight: 30, color: 'x' })
    expect(scaleStyle({ color: 'x' }, 1.5)).toEqual({ color: 'x' })   // no explicit size: inherits the parent's (already scaled) size
  })
  it('follows the setting live', async () => {
    useSettings.setState({ fontScale: 1.3 })
    const r = await render(<Text testID="t" style={{ fontSize: 10 }}>hai</Text>)
    expect(StyleSheet.flatten(r.getByTestId('t').props.style).fontSize).toBeCloseTo(13)
  })
})
