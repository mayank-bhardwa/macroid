// Small Web Audio cue for the rest timer finishing. No asset needed — a short
// two-tone beep synthesised on the fly. Also triggers a vibration on supporting
// devices. All wrapped in try/catch so it silently no-ops where unavailable
// (e.g. autoplay-restricted or unsupported browsers).

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    return ctx
  } catch {
    return null
  }
}

// Unlock/resume the audio context from within a user gesture (e.g. starting a
// workout or ticking a set) so the later timer-fired beep is allowed to play.
export function primeAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

function beep(c: AudioContext, at: number, freq: number): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
  osc.start(at)
  osc.stop(at + 0.24)
}

export function playRestDone(): void {
  try {
    const c = getCtx()
    if (c) {
      if (c.state === 'suspended') void c.resume()
      const t = c.currentTime
      beep(c, t, 880)
      beep(c, t + 0.28, 1175)
    }
  } catch {
    /* audio unavailable — ignore */
  }
  try {
    navigator.vibrate?.([200, 80, 200])
  } catch {
    /* vibration unavailable — ignore */
  }
}
