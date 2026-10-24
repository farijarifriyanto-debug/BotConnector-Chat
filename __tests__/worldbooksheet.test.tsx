import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { WorldBookSheet } from '../src/components/WorldBookSheet'
import { useWorldBook } from '../src/store/worldbook'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)

beforeEach(() => {
  useWorldBook.setState({ books: [], active: [] })
  useSettings.setState({ lang: 'en' })
})

describe('World Book sheet', () => {
  it('starts empty, adds a book and opens it', async () => {
    const r = await render(<WorldBookSheet visible onClose={() => {}} />)
    expect(r.getByText('World Book')).toBeTruthy()
    expect(r.getByTestId('lore-empty')).toBeTruthy()
    await fireEvent.press(r.getByTestId('lore-add-book'))
    const id = useWorldBook.getState().books[0].id
    expect(useWorldBook.getState().active).toEqual([id])
    expect(r.getByTestId('lore-book-name')).toBeTruthy()
    expect(r.getByTestId('lore-entries-empty')).toBeTruthy()
  })

  it('adds an entry with keywords and content, and lists it under the book', async () => {
    const bookId = useWorldBook.getState().addBook('Fakta')
    const r = await render(<WorldBookSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`lore-book-${bookId}`))
    await fireEvent.press(r.getByTestId('lore-add-entry'))
    await fireEvent.changeText(r.getByTestId('lore-entry-name'), 'Kopi')
    await fireEvent.changeText(r.getByTestId('lore-keywords'), 'kopi, arabika')
    await fireEvent.changeText(r.getByTestId('lore-content'), 'Kopi arabika tumbuh di dataran tinggi.')
    await fireEvent.press(r.getByTestId('lore-save'))
    expect(r.getByText('Kopi')).toBeTruthy()
    expect(r.getByText('kopi, arabika')).toBeTruthy()
    expect(useWorldBook.getState().books[0].entries[0]).toMatchObject({
      name: 'Kopi', keywords: ['kopi', 'arabika'], content: 'Kopi arabika tumbuh di dataran tinggi.',
    })
  })

  it('switches a book off and removes it', async () => {
    const bookId = useWorldBook.getState().addBook('Fakta')
    const r = await render(<WorldBookSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`lore-book-toggle-${bookId}`))
    expect(useWorldBook.getState().active).toEqual([])
    await fireEvent.press(r.getByTestId(`lore-book-${bookId}`))
    await fireEvent.press(r.getByTestId('lore-remove-book'))
    expect(useWorldBook.getState().books).toEqual([])
    expect(r.getByTestId('lore-empty')).toBeTruthy()
  })

  it('shows the always-on state instead of keywords and can switch an entry off', async () => {
    const bookId = useWorldBook.getState().addBook('Fakta')
    const entryId = useWorldBook.getState().addEntry(bookId)
    useWorldBook.getState().updateEntry(bookId, entryId, { content: 'Selalu dipakai.', constantActive: true })
    const r = await render(<WorldBookSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`lore-book-${bookId}`))
    expect(r.getByText('Always on')).toBeTruthy()
    await fireEvent.press(r.getByTestId(`lore-entry-toggle-${entryId}`))
    expect(useWorldBook.getState().books[0].entries[0].enabled).toBe(false)
  })
})
