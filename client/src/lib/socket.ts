import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

/**
 * Uma conexao por sessao. O token vai no handshake — o servidor resolve o
 * usuario no banco a cada conexao, entao cargo rebaixado vale na hora.
 */
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
