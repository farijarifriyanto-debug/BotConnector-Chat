import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { newConv, projectFileIds } from '../src/lib/conv'
import { ProjectsSheet } from '../src/components/ProjectsSheet'
import { ChatOptionsSheet } from '../src/components/ChatOptionsSheet'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
const mockPick = jest.fn(), mockUpload = jest.fn(), mockStatus = jest.fn(), mockDownload = jest.fn(), mockShare = jest.fn(async (_uri: string, _o?: unknown) => {})
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: (uri: string, o?: unknown) => mockShare(uri, o) }))
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', readAsStringAsync: jest.fn(async () => 'isi dokumen teks'), downloadAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: jest.fn(async () => {}), deleteConv: jest.fn(async () => {}), clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: () => mockPick(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))
jest.mock('../src/api/files', () => ({ ...jest.requireActual('../src/api/files'), uploadFile: (...a: unknown[]) => mockUpload(...a), fileStatus: (...a: unknown[]) => mockStatus(...a), downloadFile: (...a: unknown[]) => mockDownload(...a) }))

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
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files).toEqual([{ fileId: 'file_bc_9', name: 'laporan.pdf', mime: 'application/pdf', size: 10, status: 'ready', addedAt: expect.any(Number) }]))
    await waitFor(() => expect(r.getByLabelText('laporan.pdf')).toBeTruthy())

    await fireEvent.press(r.getByTestId('proj-file-del-laporan.pdf'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files).toEqual([]))

    await fireEvent.press(r.getByTestId('proj-delete'))
    await fireEvent.press(r.getByTestId('proj-delete-confirm'))
    await waitFor(() => expect(useChat.getState().convs.some(c => c.id === id)).toBe(false))
  })
})

describe('project document explorer', () => {
  const withFiles = async (files: unknown[]) => {
    const id = useChat.getState().createProject('P')
    const project = useChat.getState().convs.find(c => c.id === id)!
    useChat.setState({ convs: [project, newConv('m', id)] as never })
    await useChat.getState().updateProject(id, { files: files as never })
    return id
  }
  const big = { fileId: 'file_bc_big', name: 'besar.pdf', mime: 'application/pdf', size: 2048, status: 'ready' as const }
  const small = { fileId: 'file_bc_small', name: 'kecil.txt', mime: 'text/plain', size: 12, status: 'ready' as const }

  it('sorts by name or size and flips the direction', async () => {
    const id = await withFiles([big, small])
    const r = await render(<ProjectsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`proj-row-${id}`))
    expect(r.getAllByTestId('proj-file-row').map(n => n.props.accessibilityLabel)).toEqual(['besar.pdf', 'kecil.txt'])
    await fireEvent.press(r.getByTestId('proj-sort-size'))
    expect(r.getAllByTestId('proj-file-row').map(n => n.props.accessibilityLabel)).toEqual(['kecil.txt', 'besar.pdf'])
    await fireEvent.press(r.getByTestId('proj-sort-size'))
    expect(r.getAllByTestId('proj-file-row').map(n => n.props.accessibilityLabel)).toEqual(['besar.pdf', 'kecil.txt'])
  })

  it('previews a text document, says when it cannot preview one, and exports what it can', async () => {
    const id = await withFiles([big, small])
    mockDownload.mockResolvedValue({ uri: 'file:///cache/doc', mime: 'text/plain', name: 'kecil.txt' })
    const r = await render(<ProjectsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`proj-row-${id}`))

    await fireEvent.press(r.getByLabelText('kecil.txt'))
    await fireEvent.press(r.getByTestId('proj-act-preview'))
    await waitFor(() => expect(r.getByText('isi dokumen teks')).toBeTruthy())

    await fireEvent.press(r.getByLabelText('besar.pdf'))
    await fireEvent.press(r.getByTestId('proj-act-preview'))
    await waitFor(() => expect(r.getByTestId('proj-no-preview')).toBeTruthy())

    await fireEvent.press(r.getByLabelText('kecil.txt'))
    await fireEvent.press(r.getByTestId('proj-act-export'))
    await waitFor(() => expect(mockShare).toHaveBeenCalled())
  })

  it('renames only the label, copies the id, and removes the document from the project', async () => {
    const id = await withFiles([small])
    const r = await render(<ProjectsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId(`proj-row-${id}`))

    await fireEvent.press(r.getByLabelText('kecil.txt'))
    await fireEvent.press(r.getByTestId('proj-act-rename'))
    await fireEvent.changeText(r.getByTestId('proj-file-name'), 'catatan.txt')
    await fireEvent.press(r.getByTestId('proj-file-save'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files?.[0]).toMatchObject({ name: 'catatan.txt', fileId: 'file_bc_small' }))

    await fireEvent.press(r.getByLabelText('catatan.txt'))
    await fireEvent.press(r.getByTestId('proj-act-copy'))
    expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith('file_bc_small')

    await fireEvent.press(r.getByLabelText('catatan.txt'))
    await fireEvent.press(r.getByTestId('proj-act-delete'))
    await waitFor(() => expect(useChat.getState().convs.find(c => c.id === id)?.files).toEqual([]))
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
