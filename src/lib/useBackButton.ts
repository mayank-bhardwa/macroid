import { useEffect, useRef } from 'react'

// Make the device Back button (Android hardware/gesture back in an installed
// PWA) close the top-most in-app overlay instead of exiting the app.
//
// Design: keep a LIFO stack of dismiss callbacks and maintain EXACTLY ONE
// sentinel history entry whenever the stack is non-empty ("armed"). A single
// popstate listener consumes the sentinel on Back, dismisses the top overlay,
// and re-arms if overlays remain. Programmatic closes remove the sentinel only
// when the last overlay closes. Because history.back() is only ever called
// while a sentinel exists, it always pops a same-document entry (so popstate
// fires reliably) — this keeps things balanced and avoids accidentally
// navigating the app away.

type Entry = { cb: () => void }

const stack: Entry[] = []
let armed = false
let ignoreNextPop = false
let attached = false
let disarmTimer: ReturnType<typeof setTimeout> | null = null

function clearDisarm() {
  if (disarmTimer != null) {
    clearTimeout(disarmTimer)
    disarmTimer = null
  }
}

// Arm the single sentinel history entry (idempotent). Also cancels a pending
// disarm, which makes it safe against React StrictMode's dev remount cycle
// (setup → cleanup → setup): the cleanup's disarm is scheduled, then the second
// setup cancels it and reuses the existing sentinel — no history churn.
function arm() {
  clearDisarm()
  if (armed) return
  window.history.pushState(null, '')
  armed = true
}

// Remove the sentinel, but deferred so an immediate re-arm (StrictMode) cancels
// it. history.back() only runs while a sentinel exists, so it always pops a
// same-document entry (never navigates the app away).
function scheduleDisarm() {
  clearDisarm()
  disarmTimer = setTimeout(() => {
    disarmTimer = null
    if (stack.length === 0 && armed) {
      armed = false
      ignoreNextPop = true
      window.history.back()
    }
  }, 0)
}

function onPop() {
  clearDisarm()
  if (ignoreNextPop) {
    ignoreNextPop = false
    return
  }
  // A real Back press consumed the sentinel.
  armed = false
  const entry = stack.pop()
  if (entry) {
    entry.cb()
    if (stack.length > 0) arm() // overlays still open — re-arm for the next Back
  }
}

function ensureAttached() {
  if (attached || typeof window === 'undefined') return
  window.addEventListener('popstate', onPop)
  attached = true
}

export function useBackButton(active: boolean, onBack: () => void) {
  const cbRef = useRef(onBack)
  cbRef.current = onBack

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    ensureAttached()
    const entry: Entry = { cb: () => cbRef.current() }
    stack.push(entry)
    arm()
    return () => {
      const idx = stack.lastIndexOf(entry)
      if (idx === -1) return // already removed by a Back press
      stack.splice(idx, 1)
      if (stack.length === 0) scheduleDisarm()
    }
  }, [active])
}
