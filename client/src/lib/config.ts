export type DesktopSource = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  icon: string | null;
};

declare global {
  interface Window {
    desktop?: {
      listSources: () => Promise<DesktopSource[]>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isElectron: true;
    };
  }
}

export const isElectron = Boolean(window.desktop?.isElectron);

const KEY = 'serverUrl';

/**
 * No navegador o servidor e a mesma origem — em dev o proxy do Vite resolve.
 *
 * No Electron nao existe origem: a janela carrega de file://, entao um
 * fetch('/api/...') viraria file:///api/... e nao sairia da maquina. O
 * endereco vem do campo do login e fica guardado aqui.
 */
export function getServerUrl(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function setServerUrl(url: string) {
  const limpo = url.trim().replace(/\/+$/, '');
  if (limpo) localStorage.setItem(KEY, limpo);
  else localStorage.removeItem(KEY);
}

export function apiUrl(path: string) {
  return `${getServerUrl()}/api${path}`;
}
