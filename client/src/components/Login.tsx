import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { getServerUrl, isElectron, setServerUrl } from '../lib/config';

export function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [servidor, setServidor] = useState(getServerUrl());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Precisa entrar antes da primeira chamada: no Electron nao existe
    // origem para cair de volta.
    if (isElectron) setServerUrl(servidor);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register({
          username,
          displayName: displayName || username,
          password,
          inviteCode: inviteCode || undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falhou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>

        {isElectron && (
          <label>
            Servidor
            <input
              value={servidor}
              onChange={(e) => setServidor(e.target.value)}
              placeholder="http://192.168.0.10:3001"
              required
            />
          </label>
        )}

        <label>
          Usuário
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            Nome de exibição
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="igual ao usuário se vazio"
            />
          </label>
        )}

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            Convite
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="vazio só funciona no primeiro cadastro"
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? '...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Tenho um convite' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
