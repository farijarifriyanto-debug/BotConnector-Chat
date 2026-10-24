import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { newConv, projectFileIds } from '../src/lib/conv'
import { ProjectsSheet } from '../src/components/ProjectsSheet'
import { ChatOptionsSheet } from '../src/components/ChatOptionsSheet'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
const mockPick = jest.fn(), mockUpload = jest.fn(), mockStatus = jest.fn()
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: jest.fn(async () => {}), deleteConv: jest.fn(async () => {}), clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: () => mockPick(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))
jest.mock('../src/api/files', () => ({ ...jest.requireActual('../src/api/files'), uploadFile: (...a: unknown[]) => mockUpload(...a), fileStatus: (...a: unknown[]) => mockStatus(...a) }))

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
const reset = (convs: unknown[] = []) => useChat.setState({ models: [model], modelId: 'm', convs: convs as never, activeId: null, draft: newConv('m'), busy: false })

beforeEach(() => {
  jest.clearAllMocks()
  useSettings.setState({ lang: 'en' })
  reset()
})

describe('project records', () => {
  it('creates, renames and deletes a project without touching its chats', async () => {
    const s = () => useChat.getState()
    const id = s().createProject('Riset harga')
    expect(s().convs.find(c => c.id === id)).toMatchObject({ kind: 'project', title: 'Riset harga', files: [] })

    await s().updateProject(id, { title: 'Riset beras' })
    expect(s().convs.find(c => c.id === id)?.title).toBe('Riset beras')

    const chat = newConv('m', id)
    reset([chat, ...s().convs])
    await s().removeProject(id)
    expect(s().convs.find(c => c.id === id)).toBeUndefined()
    expect(s().convs.find(c => c.id === chat.id)?.projectId).toBe(id)   // dangling id = unbound, like the reference app
  })

  it('binds and unbinds a chat', async () => {
    const id = useChat.getState().createProject('P')
    const chat = newConv('m')
    reset([chat, ...useChat.getState().convs])
    await useChat.getState().bindProject(chat.id, id)
    expect(useChat.getState().convs.find(c => c.id === chat.id)?.projectId).toBe(id)
    await useChat.getState().bindProject(chat.id, null)
    expect(useChat.getState().convs.find(c => c.id === chat.id)?.projectId).toBeUndefined()
  })

  it('hands only finished project documents to the chat', () => {
    const project = { ...newConv('m'), kind: 'project' as const, id: 'p1', files: [
      { fileId: 'file_bc_1', name: 'a.pdf', mime: 'application/pdf', size: 1, status: 'ready' as const },
      { fileId: 'file_bc_2', name: 'b.pdf', mime: 'application/pdf', size: 1, status: 'processing' as const },
      { fileId: 'file_bc_3', name: 'c.pdf', mime: 'application/pdf', size: 1, status: 'failed' as const },
    ] }
    const chat = newConv('m', 'p1')
    expect(projectFileIds(chat, [project, chat])).toEqual(['file_bc_1'])
    expect(projectFileIds(newConv('m'), [project])).toEqual([])
  })
})

describe('projects sheet', () => {
  it('shows the empty state, then creates and opens a project', async () => {
    const r = await render(<ProjectsSheet visible onClose={() => {}} />)
    expect(r.getByText('No projects yet.')).toBeTruthy()
    await fireEvent.press(r.getByTestId('proj-new'))
    await fireEvent.changeText(r.getByTestId('proj-name'), 'Riset harga')
    await fireEvent.press(r.getByTestId('proj-save'))

    await waitFor(() => expect(useChat.getState().convs.filter(c => c.kind === 'project')).toHaveLength(1))
    const id = useChat.getState().convs.find(c => c.kind === 'project')!.id
    await waitFor(() => expect(r.getByTestId(`proj-row-${id}`)).toBeTruthy())

    await fireEvent.press(r.getByTestId(`proj-row-${id}`))
    await fireEvent.press(r.getByTestId('proj-edit'))
    await fireEvent.changeText(r.getByTestId('proj-name'), 'Riset beras')
    await fireEvent.press(r.getByTestId('proj-save'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.title).toBe('Riset beras'))
  })

  it('adds a document, drops files that failed, and deletes the project', async () => {
    const id = useChat.getState().createProject('P')
    mockPick.mockResolvedValue({ id: 'x', kind: 'file', name: 'laporan.pdf', mime: 'application/pdf', size: 10, sourceUri: 'file:///x.pdf', status: 'uploading' })
    mockUpload.mockResolvedValue({ id: 'file_bc_9', status: 'ready' })

    const r = await render(<ProjectsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`proj-row-${id}`))
    await fireEvent.press(r.getByTestId('proj-add-files'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files).toEqual([{ fileId: 'file_bc_9', name: 'laporan.pdf', mime: 'application/pdf', size: 10, status: 'ready' }]))
    await waitFor(() => expect(r.getByTestId('proj-file-laporan.pdf')).toBeTruthy())

    await fireEvent.press(r.getByTestId('proj-file-del-laporan.pdf'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files).toEqual([]))

    await fireEvent.press(r.getByTestId('proj-delete'))
    await fireEvent.press(r.getByTestId('proj-delete-confirm'))
    await waitFor(() => expect(useChat.getState().convs.some(c => c.id === id)).toBe(false))
  })
})

describe('binding a chat from its options', () => {
  it('picks a project and can clear it again', async () => {
    const pid = useChat.getState().createProject('Riset')
    const chat = newConv('m')
    reset([chat, ...useChat.getState().convs])

    const r = await render(<ChatOptionsSheet visible conv={useChat.getState().convs.find(c => c.id === chat.id)!} onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('options-project'))
    await fireEvent.press(r.getByTestId(`proj-pick-${pid}`))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === chat.id)?.projectId).toBe(pid))

    await fireEvent.press(r.getByTestId('options-project'))
    await fireEvent.press(r.getByTestId('proj-pick-none'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === chat.id)?.projectId).toBeUndefined())
  })
})
