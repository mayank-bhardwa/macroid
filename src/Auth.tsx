import { useState } from 'react'
import { useStore } from './store/store'

// Full-screen gate shown until the user has a session. Blocks the entire app.
export function AuthScreen() {
  const register = useStore((s) => s.register)
  const login = useStore((s) => s.login)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
    } catch (e) {
      setError((e as Error).message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          Macro<b>id</b>
        </div>
        <p className="auth-tagline">
          {mode === 'login' ? 'Sign in to continue' : 'Create your account to get started'}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="field">
            <span className="lbl">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="lbl">Password (min 8 chars)</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn primary block" type="submit" disabled={!valid || busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button className="link-btn" onClick={() => { setMode('register'); setError('') }}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="link-btn" onClick={() => { setMode('login'); setError('') }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
