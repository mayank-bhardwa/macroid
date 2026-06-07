import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallGlobal = { event: BeforeInstallPromptEvent | null; installed: boolean }

// The stash populated by the inline script in index.html (which starts listening
// before React mounts, so an early `beforeinstallprompt` is never missed).
function installGlobal(): InstallGlobal {
  const w = window as unknown as { __macroidInstall?: InstallGlobal }
  if (!w.__macroidInstall) w.__macroidInstall = { event: null, installed: false }
  return w.__macroidInstall
}

export function useInstallPrompt() {
  // Seed from whatever the early listener already captured, so opening Settings
  // long after load still sees the prompt.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? installGlobal().event : null,
  )
  const [installed, setInstalled] = useState(() =>
    typeof window !== 'undefined' ? installGlobal().installed : false,
  )

  useEffect(() => {
    // Re-dispatched by the index.html listener when the prompt becomes available.
    const onAvailable = () => setDeferred(installGlobal().event)
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    // Also handle the native event directly in case it fires after mount (and
    // keep the global in sync so other consumers see it too).
    const onPrompt = (e: Event) => {
      e.preventDefault()
      installGlobal().event = e as BeforeInstallPromptEvent
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('macroid:installavailable', onAvailable)
    window.addEventListener('macroid:installed', onInstalled)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // Catch anything that landed between the initial render and this effect.
    setDeferred(installGlobal().event)
    return () => {
      window.removeEventListener('macroid:installavailable', onAvailable)
      window.removeEventListener('macroid:installed', onInstalled)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async (): Promise<boolean> => {
    const evt = deferred ?? installGlobal().event
    if (!evt) return false
    await evt.prompt()
    const choice = await evt.userChoice
    // A prompt can only be used once.
    installGlobal().event = null
    setDeferred(null)
    return choice.outcome === 'accepted'
  }

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true)

  return { canInstall: !!deferred, promptInstall, installed: installed || isStandalone }
}
