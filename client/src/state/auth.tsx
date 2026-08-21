import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken } from '../lib/api';
import { disconnectSocket } from '../lib/socket';
import type { User } from '../types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: {
    username: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) => Promise<void>;
  logout: () => void;
  /** Cargo mudou embaixo dos pes: o servidor mandou member:updated sobre voce. */
  applyUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Token guardado nao quer dizer sessao valida: pode ter expirado ou o
  // usuario ter sido expulso. Quem decide e o /api/me.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user, token } = await api.login(username, password);
    setToken(token);
    setUser(user);
  }, []);

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const { user, token } = await api.register(input);
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  const applyUser = useCallback((updated: User) => setUser(updated), []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, applyUser }),
    [user, loading, login, register, logout, applyUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
