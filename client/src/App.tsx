import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from './lib/socket';
import { api } from './lib/api';
import { useAuth } from './state/auth';
import { useMessages } from './hooks/useMessages';
import { ChannelList } from './components/ChannelList';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { Login } from './components/Login';
import type { Channel, User } from './types';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="boot">…</div>;
  if (!user) return <Login />;
  return <Chat me={user} onLogout={logout} />;
}

function Chat({ me, onLogout }: { me: User; onLogout: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const s = connectSocket();
    setSocket(s);

    const onChannelCreated = (channel: Channel) =>
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]
      );

    const onChannelDeleted = ({ id }: { id: string }) => {
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
    };

    s.on('channel:created', onChannelCreated);
    s.on('channel:deleted', onChannelDeleted);

    return () => {
      s.off('channel:created', onChannelCreated);
      s.off('channel:deleted', onChannelDeleted);
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    api
      .bootstrap()
      .then(({ channels }) => {
        setChannels(channels);
        const first = channels.find((c) => c.type === 'TEXT');
        setActiveId((prev) => prev ?? first?.id ?? null);
      })
      .catch((err: unknown) =>
        setFatal(err instanceof Error ? err.message : 'Falhou ao carregar.')
      );
  }, []);

  const active = useMemo(
    () => channels.find((c) => c.id === activeId) ?? null,
    [channels, activeId]
  );

  const { messages, loading, error } = useMessages(socket, active?.id ?? null);

  if (fatal) return <div className="boot error">{fatal}</div>;

  return (
    <div className="app">
      <ChannelList
        channels={channels}
        activeId={activeId}
        onSelect={setActiveId}
        me={me}
        onLogout={onLogout}
      />

      <main className="main">
        {active ? (
          <>
            <header className="topbar">
              <span className="hash">#</span>
              <strong>{active.name}</strong>
              {active.topic && <span className="topic">{active.topic}</span>}
            </header>

            <MessageList messages={messages} loading={loading} error={error} />

            {socket && (
              <Composer
                socket={socket}
                channelId={active.id}
                channelName={active.name}
              />
            )}
          </>
        ) : (
          <div className="boot">
            Nenhum canal de texto. Crie um com <code>POST /api/channels</code>.
          </div>
        )}
      </main>
    </div>
  );
}
