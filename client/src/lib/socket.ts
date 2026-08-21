import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import { getServerUrl } from './config';

/**
 * Uma conexao por sessao. O token vai no handshake — o servidor resolve o
 * usuario no banco a cada conexao, entao cargo rebaixado vale na hora.
 */
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  // Sem endereco, mesma origem (navegador). Com endereco, o host guardado
  // no login — e o caso do Electron, que roda em file:// e nao tem origem.
  const base = getServerUrl();
  const opts = { auth: { token: getToken() }, transports: ['websocket', 'polling'] };
  socket = base ? io(base, opts) : io(opts);
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
