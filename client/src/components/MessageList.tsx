import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { Avatar } from './Avatar';

const hora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

const diaEHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function MessageList({
  messages,
  loading,
  error,
}: {
  messages: Message[];
  loading: boolean;
  error: string | null;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (loading) return <div className="messages empty">carregando…</div>;
  if (error) return <div className="messages error">{error}</div>;

  return (
    <div className="messages">
      {messages.length === 0 && <p className="empty">Nada por aqui ainda.</p>}

      {messages.map((m, i) => {
        // Mensagens seguidas da mesma pessoa em menos de 5 min viram um bloco.
        const anterior = messages[i - 1];
        const agrupa =
          anterior !== undefined &&
          anterior.author.id === m.author.id &&
          new Date(m.createdAt).getTime() -
            new Date(anterior.createdAt).getTime() <
            5 * 60_000;

        const data = new Date(m.createdAt);
        const hoje = new Date().toDateString() === data.toDateString();

        return (
          <article key={m.id} className={agrupa ? 'message grouped' : 'message'}>
            {agrupa ? (
              <span className="gutter" />
            ) : (
              <Avatar user={m.author} size={36} />
            )}
            <div className="body">
              {!agrupa && (
                <header>
                  <span
                    className="author"
                    style={{ color: m.author.avatarColor }}
                  >
                    {m.author.displayName}
                  </span>
                  <time dateTime={m.createdAt}>
                    {hoje ? hora.format(data) : diaEHora.format(data)}
                  </time>
                </header>
              )}
              <p>{m.content}</p>
            </div>
          </article>
        );
      })}

      <div ref={bottom} />
    </div>
  );
}
