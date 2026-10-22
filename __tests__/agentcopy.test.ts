import { STRINGS } from '../src/i18n/strings'

const KEYS = [
  'agent', 'agentNote', 'agentDevices', 'agentNoDevices', 'agentRefresh', 'agentSessions', 'agentNoSessions',
  'agentNew', 'agentWorkspaces', 'agentNoWorkspaces', 'agentStart', 'agentOpen', 'agentUpdateCli', 'agentUpdateCliHint',
  'agentComposer', 'agentSend', 'agentCancelTurn', 'agentRunning', 'agentApproval', 'agentAllow', 'agentAllowSession',
  'agentDeny', 'agentThinking', 'agentToolRunning', 'agentToolOk', 'agentToolError', 'agentUsage', 'agentTruncated',
  'agentPrivacy', 'agentErrRuntime', 'agentErrNotConfigured', 'agentErrUnsupported', 'agentErrBusy', 'agentErrCapacity',
  'agentErrOffline', 'agentErrTimeout', 'agentErrAuth', 'agentErrGeneric', 'agentRetry', 'agentClose', 'agentDiff',
] as const

describe('agent session copy', () => {
  it('exists in English and Indonesian', () => {
    for (const k of KEYS) {
      expect((STRINGS.en as Record<string, string>)[k]).toBeTruthy()
      expect((STRINGS.id as Record<string, string>)[k]).toBeTruthy()
    }
  })

  it('tells the user where the agent runs and how to fix a missing runtime', () => {
    expect(STRINGS.en.agentNote).toMatch(/computer/i)
    expect(STRINGS.en.agentErrRuntime).toContain('npm i -g @botconnector/bccli')
    expect(STRINGS.en.agentErrUnsupported).toContain('npm i -g @botconnector/bccli')
    expect(STRINGS.id.agentErrRuntime).toContain('npm i -g @botconnector/bccli')
  })
})
