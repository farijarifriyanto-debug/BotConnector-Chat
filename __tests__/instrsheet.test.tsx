import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { InstructionsSheet } from '../src/components/InstructionsSheet'
import { useInstructions } from '../src/store/instructions'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)

beforeEach(() => {
  useInstructions.setState({ items: [], active: [] })
  useSettings.setState({ lang: 'en' })
})

describe('Instruction Injection sheet', () => {
  it('starts empty and explains what the cards do', async () => {
    const r = await render(<InstructionsSheet visible onClose={() => {}} />)
    expect(r.getByText('Instruction Injection')).toBeTruthy()
    expect(r.getByTestId('instr-empty')).toBeTruthy()
  })

  it('adds a card: title and prompt are saved and the card is listed', async () => {
    const r = await render(<InstructionsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('instr-add-row'))
    await fireEvent.changeText(r.getByTestId('instr-title-input'), 'Bahasa Indonesia')
    await fireEvent.changeText(r.getByTestId('instr-prompt-input'), 'Selalu jawab dalam bahasa Indonesia.')
    await fireEvent.press(r.getByTestId('instr-save'))
    expect(r.getByText('Bahasa Indonesia')).toBeTruthy()
    expect(r.getByText('Selalu jawab dalam bahasa Indonesia.')).toBeTruthy()
    expect(useInstructions.getState().items).toHaveLength(1)
    expect(useInstructions.getState().items[0].prompt).toBe('Selalu jawab dalam bahasa Indonesia.')
  })

  it('switches a card on and off from the list', async () => {
    const id = useInstructions.getState().add('Ringkas', 'Jawab maksimal 3 kalimat.')
    const r = await render(<InstructionsSheet visible onClose={() => {}} />)
    expect(r.getByTestId(`instr-toggle-${id}`).props.accessibilityState.checked).toBe(false)
    await fireEvent.press(r.getByTestId(`instr-toggle-${id}`))
    expect(r.getByTestId(`instr-toggle-${id}`).props.accessibilityState.checked).toBe(true)
    expect(useInstructions.getState().active).toEqual([id])
    await fireEvent.press(r.getByTestId(`instr-toggle-${id}`))
    expect(useInstructions.getState().active).toEqual([])
  })

  it('opens a card for editing and deletes it', async () => {
    const id = useInstructions.getState().add('Lama', 'Isi lama.')
    const r = await render(<InstructionsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`instr-tip-${id}`))
    expect(r.getByTestId('instr-title-input').props.value).toBe('Lama')
    await fireEvent.changeText(r.getByTestId('instr-prompt-input'), 'Isi baru.')
    await fireEvent.press(r.getByTestId('instr-save'))
    expect(useInstructions.getState().items[0].prompt).toBe('Isi baru.')
    await fireEvent.press(r.getByTestId(`instr-tip-${id}`))
    await fireEvent.press(r.getByTestId('instr-delete'))
    expect(useInstructions.getState().items).toEqual([])
    expect(r.getByTestId('instr-empty')).toBeTruthy()
  })
})
