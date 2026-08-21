import { apiUrl } from './config';
import type { Bootstrap, Invite, Message, Role, User } from '../types';

const TOKEN_KEY = 'token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * O servidor devolve { error } com o status certo. Traduzimos isso pra
 * excecao, para a UI so precisar de try/catch.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
  return body as T;
}

type AuthResponse = { user: User; token: string };

export const api = {
  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (input: {
    username: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => request<User>('/me'),

  bootstrap: () => request<Bootstrap>('/bootstrap'),

  messages: (channelId: string, before?: string) =>
    request<Message[]>(
      `/channels/${channelId}/messages${before ? `?before=${before}` : ''}`
    ),

  createInvite: (input: { maxUses: number; expiresInHours: number | null }) =>
    request<Invite>('/invites', { method: 'POST', body: JSON.stringify(input) }),

  setRole: (userId: string, role: Role) =>
    request<User>(`/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  kickMember: (userId: string) =>
    request<{ ok: true }>(`/members/${userId}`, { method: 'DELETE' }),
};
