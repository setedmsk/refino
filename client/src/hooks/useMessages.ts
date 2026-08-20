import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';
import type { Message } from '../types';

/**
 * Historico do canal + tempo real.
 *
 * O servidor emite message:new para todo mundo, nao so para quem esta no
 * canal, entao filtramos por channelId aqui. Numa sala de amigos o volume
 * e irrisorio; se um dia incomodar, o lugar de arrumar e o io.emit do
 * servidor, virando io.to(`channel:${id}`).
 */
export function useMessages(socket: Socket | null, channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    // Troca de canal durante um fetch lento nao pode sobrescrever o canal novo.
    let current = true;
    setLoading(true);
    setError(null);

    api
      .messages(channelId)
      .then((history) => {
        if (current) setMessages(history);
      })
      .catch((err: unknown) => {
        if (current) setError(err instanceof Error ? err.message : 'Falhou.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [channelId]);

  useEffect(() => {
    if (!socket || !channelId) return;

    const onNew = (message: Message) => {
      if (message.channelId !== channelId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      );
    };

    const onDeleted = ({ id }: { id: string; channelId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    };

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
    };
  }, [socket, channelId]);

  return { messages, loading, error };
}
