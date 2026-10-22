// Local notifications for a pending agent approval, so the phone is told without the user
// having to keep the app open. Local only: no push server, no device token, no new backend.
import * as Notifications from 'expo-notifications'

let permission: boolean | null = null
let handlerInstalled = false

export const APPROVAL_CHANNEL = 'agent-approvals'

/** Asks once per app run. Returns false when the user declined; callers must stay silent then. */
export async function ensureAgentNotifications(): Promise<boolean> {
  if (permission !== null) return permission
  try {
    const current = await Notifications.getPermissionsAsync()
    permission = current.granted === true
    if (!permission) {
      const asked = await Notifications.requestPermissionsAsync()
      permission = asked.granted === true
    }
  } catch { permission = false }
  return permission
}

/** Shows one notification per approval request; returns false when it could not be shown. */
export async function notifyApproval(input: { title: string; body: string; requestId: string }): Promise<boolean> {
  if (!(await ensureAgentNotifications())) return false
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: { kind: 'agent-approval', requestId: input.requestId },
        ...(process.env.EXPO_OS === 'android' ? { channelId: APPROVAL_CHANNEL } : {}),
      },
      trigger: null,
    })
    return true
  } catch { return false }
}

/** Routes a tap on the approval notification to the caller (which opens the session sheet). */
export function onApprovalTap(open: () => void): () => void {
  if (handlerInstalled) return () => {}
  handlerInstalled = true
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response?.notification?.request?.content?.data
    if (data && data.kind === 'agent-approval') open()
  })
  return () => { try { sub.remove() } catch { /* already gone */ } handlerInstalled = false }
}

/** Test seam: forget the cached permission decision. */
export const __resetNotify = () => { permission = null }
