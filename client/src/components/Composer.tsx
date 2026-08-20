import { useState, type KeyboardEvent } from 'react';
import type { Socket } from 'socket.io-client';
import type { Ack } from '../types';

export function Composer({
  socket,
  channelId,
  channelName,
}: {
  socket: Socket;
  channelId: string;
  channelName: string;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function send() {
    const content = text.trim();
    if (!content) return;

    // Limpa antes do ack: a mensagem volta pelo message:new. Se der erro,
    // devolvemos o texto pro campo em vez de perder o que a pessoa escreveu.
    setText('');
    setError(null);

    socket.emit(
      'message:send',
      { channelId, content },
      (ack: Ack<{ id: string }>) => {
        if (!ack?.ok) {
          setText(content);
          setError(ack?.error ?? 'Não foi possível enviar.');
        }
      }
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="composer">
      {error && <p className="error">{error}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Mensagem em #${channelName}`}
        rows={1}
        maxLength={4000}
      />
    </div>
  );
}
