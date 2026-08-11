import { useState } from 'react';
import { setAuth } from '../lib/auth';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';

const inputStyle = {
  padding: '9px 12px',
  background: 'var(--paper2)',
  border: '1px solid var(--rule2)',
  color: 'var(--ink)',
  fontFamily: 'var(--mono)',
  fontSize: 13,
  outline: 'none',
  borderRadius: 2,
  width: '100%',
};

const labelTextStyle = {
  fontFamily: 'var(--sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
};

export default function LoginPage({ onLogin, onBack }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    if (isRegister) {
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setLoading(true);
    setTimeout(() => {
      setAuth(email.trim());
      onLogin();
    }, 400);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      background: 'var(--paper)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Back link */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--sans)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink3)',
              cursor: 'pointer',
              padding: '0 0 32px',
              display: 'block',
            }}
          >
            ← Back
          </button>
        )}

        {/* Masthead */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 11,
            background: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            margin: '0 auto 16px',
            color: 'var(--paper)',
          }}>
            ∫
          </div>
          <h1 style={{
            fontFamily: 'var(--serif)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            marginBottom: 6,
          }}>
            {APP_NAME}
          </h1>
          <p style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--ink3)',
          }}>
            {APP_TAGLINE}
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: '3px double var(--ink)', marginBottom: 32 }}>
          {['signin', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -3,
                paddingBottom: 10,
                fontFamily: 'var(--sans)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: mode === m ? 'var(--accent)' : 'var(--ink3)',
                cursor: 'pointer',
              }}
            >
              {m === 'signin' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>

            {isRegister && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelTextStyle}>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                  placeholder="Optional"
                  style={{ ...inputStyle, color: name ? 'var(--ink)' : undefined }}
                />
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelTextStyle}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus={!isRegister}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelTextStyle}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                style={inputStyle}
              />
            </label>

            {isRegister && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelTextStyle}>Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>
            )}
          </div>

          {error && (
            <p style={{
              fontFamily: 'var(--sans)',
              fontSize: 11,
              color: 'var(--accent)',
              marginBottom: 16,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', padding: '10px 12px', fontSize: 12 }}
          >
            {loading
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>

        {/* Footer note */}
        <p style={{
          marginTop: 32,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 11,
          color: 'var(--ink4)',
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          Research viewer. Probabilities from Kalshi — not financial advice.
        </p>
      </div>
    </div>
  );
}
