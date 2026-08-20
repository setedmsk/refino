import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from './lib/socket';
import { api } from './lib/api';
import { useAuth } from './state/auth';
import { useMessages } from './hooks/useMessages';
import { useVoiceRoom } from './hooks/useVoiceRoom.js';
import { ChannelList } from './components/ChannelList';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { VoicePanel } from './components/VoicePanel';
import { ScreenStage } from './components/ScreenStage';
import { Login } from './components/Login';
import type { Channel, PeerStats, PresetName, User, VoicePresence, VoiceRoom } from './types';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="boot">…</div>;
  if (!user) return <Login />;
  return <Chat me={user} onLogout={logout} />;
}

function Chat({ me, onLogout }: { me: User; onLogout: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, VoicePresence>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const voice = useVoiceRoom(socket, me) as VoiceRoom;

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

    // Roster de voz: vale para todo mundo, esteja ou nao na sala.
    const onPeerJoined = ({ channelId, user }: { channelId: string; user: User }) => {
      setUsers((prev) => ({ ...prev, [user.id]: user }));
      setVoiceStates((prev) => ({
        ...prev,
        [user.id]: {
          channelId,
          muted: false,
          deafened: false,
          streaming: false,
          cameraOn: false,
        },
      }));
    };

    const onPeerLeft = ({ userId }: { userId: string }) =>
      setVoiceStates((prev) => {
        if (!(userId in prev)) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });

    const onVoiceState = (
      patch: { userId: string; channelId: string } & Partial<VoicePresence>
    ) =>
      setVoiceStates((prev) => {
        const atual = prev[patch.userId];
        if (!atual) return prev;
        return { ...prev, [patch.userId]: { ...atual, ...patch } };
      });

    const onMemberUpdated = (user: User) =>
      setUsers((prev) => ({ ...prev, [user.id]: user }));

    s.on('channel:created', onChannelCreated);
    s.on('channel:deleted', onChannelDeleted);
    s.on('voice:peer-joined', onPeerJoined);
    s.on('voice:peer-left', onPeerLeft);
    s.on('voice:state', onVoiceState);
    s.on('member:updated', onMemberUpdated);

    return () => {
      s.off('channel:created', onChannelCreated);
      s.off('channel:deleted', onChannelDeleted);
      s.off('voice:peer-joined', onPeerJoined);
      s.off('voice:peer-left', onPeerLeft);
      s.off('voice:state', onVoiceState);
      s.off('member:updated', onMemberUpdated);
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    api
      .bootstrap()
      .then(({ channels, users, voiceStates }) => {
        setChannels(channels);
        setUsers(Object.fromEntries(users.map((u) => [u.id, u])));
        setVoiceStates(
          Object.fromEntries(
            voiceStates.map((v) => [
              v.userId,
              {
                channelId: v.channelId,
                muted: v.muted,
                deafened: v.deafened,
                streaming: v.streaming,
                cameraOn: v.cameraOn,
              },
            ])
          )
        );
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

  const voiceMembers = useCallback(
    (channelId: string) =>
      Object.entries(voiceStates)
        .filter(([, presence]) => presence.channelId === channelId)
        .map(([userId, presence]) => ({ user: users[userId], presence }))
        .filter((m): m is { user: User; presence: VoicePresence } => Boolean(m.user)),
    [voiceStates, users]
  );

  const onJoinVoice = useCallback(
    async (channelId: string) => {
      setVoiceError(null);
      if (voice.channelId === channelId) return voice.leave();
      try {
        await voice.join(channelId);
      } catch (err) {
        // Microfone negado ou canal recusado pelo servidor: a pessoa precisa
        // saber, senao fica achando que entrou.
        setVoiceError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      }
    },
    [voice]
  );

  const voiceChannel = useMemo(
    () => channels.find((c) => c.id === voice.channelId) ?? null,
    [channels, voice.channelId]
  );

  /*
   * Quem esta com a tela no ar. Nao da para perguntar isso ao MediaStream: o
   * transceiver de video e negociado quando a chamada comeca, entao todo peer
   * ja tem um screenStream com uma faixa vazia desde o inicio. Quem sabe de
   * verdade e o `streaming` do voice:state.
   */
  const transmissor = useMemo(() => {
    if (!voice.channelId) return null;
    const outro = Object.entries(voiceStates).find(
      ([userId, p]) =>
        p.channelId === voice.channelId && p.streaming && userId !== me.id
    );
    if (!outro) return null;
    const [userId] = outro;
    const stream = voice.peers[userId]?.screenStream;
    return stream ? { user: users[userId], stream } : null;
  }, [voiceStates, voice.channelId, voice.peers, users, me.id]);

  const statsDaTela = useCallback((): Array<{ label: string; sample: PeerStats | undefined }> => {
    // Compartilhando: uma linha por destino, porque cada peer tem o proprio
    // encoder e um pode estar limitado enquanto o outro vai bem.
    if (voice.sharing) {
      return Object.keys(voice.peers).map((peerId) => ({
        label: users[peerId]?.displayName ?? '—',
        sample: voice.stats[peerId],
      }));
    }
    if (transmissor) {
      return [{ label: '', sample: voice.stats[transmissor.user.id] }];
    }
    return [];
  }, [voice.sharing, voice.peers, voice.stats, transmissor, users]);

  if (fatal) return <div className="boot error">{fatal}</div>;

  return (
    <div className="app">
      <div className="sidebar-column">
        <ChannelList
          channels={channels}
          activeId={activeId}
          onSelect={setActiveId}
          me={me}
          onLogout={onLogout}
          voiceMembers={voiceMembers}
          onJoinVoice={onJoinVoice}
          voiceChannelId={voice.channelId}
          speaking={voice.speaking}
        />

        {voiceError && <p className="error voice-error">{voiceError}</p>}

        {voice.connected && voiceChannel && (
          <VoicePanel
            voice={voice}
            channelName={voiceChannel.name}
            me={me}
            members={voiceMembers(voiceChannel.id)}
          />
        )}
      </div>

      <main className="main">
        {active ? (
          <>
            <header className="topbar">
              <span className="hash">#</span>
              <strong>{active.name}</strong>
              {active.topic && <span className="topic">{active.topic}</span>}
            </header>

            {voice.sharing && voice.localScreen && (
              <ScreenStage
                stream={voice.localScreen}
                title="Sua tela"
                isLocal
                presetName={voice.presetName}
                onChangePreset={(p: PresetName) => voice.changeQuality(p)}
                onStop={() => voice.stopScreenShare()}
                stats={statsDaTela()}
              />
            )}

            {!voice.sharing && transmissor && (
              <ScreenStage
                stream={transmissor.stream}
                title={`Tela de ${transmissor.user?.displayName ?? 'alguém'}`}
                isLocal={false}
                presetName={voice.presetName}
                onChangePreset={(p: PresetName) => voice.changeQuality(p)}
                onStop={() => {}}
                stats={statsDaTela()}
              />
            )}

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
