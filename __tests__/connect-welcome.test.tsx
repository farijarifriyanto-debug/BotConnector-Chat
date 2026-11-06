import './helpers/mocks'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ConnectAiWelcome } from '../src/components/ConnectAiWelcome'
import { useSettings } from '../src/store/settings'
it('offers connection and local models with no unusable message input', async () => {
  useSettings.setState({ lang: 'en' })
  const connect = jest.fn(), local = jest.fn()
  const r = await render(<ConnectAiWelcome onConnect={connect} onLocal={local} />)
  await fireEvent.press(r.getByTestId('empty-add-provider'))
  await fireEvent.press(r.getByTestId('empty-add-local'))
  expect(connect).toHaveBeenCalledTimes(1); expect(local).toHaveBeenCalledTimes(1)
  expect(r.getByText('Great conversations start here.')).toBeTruthy()
  expect(r.queryByPlaceholderText('Message BotConnector…')).toBeNull()
})
