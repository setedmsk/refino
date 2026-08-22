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
import { AdminPanel } from './components/AdminPanel';
import type {
  Channel,
  ChannelType,
  PeerStats,
  Permission,
  PresetName,
  User,
  VoicePresence,
  VoiceRoom,
} from './types';

export default function App() {
  const { user, loading, logout, applyUser } = useAuth();

  if (loading) return <div className="boot">…</div>;
  if (!user) return <Login />;
  return (
    <Chat
      key={user.id}
      me={user}
      onLogout={logout}
      onMeUpdated={applyUser}
    />
  );
}

function Chat({
  me,
  onLogout,
  onMeUpdated,
}: {
  me: User;
  onLogout: () => void;
  onMeUpdated: (user: User) => void;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, VoicePresence>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [adminAberto, setAdminAberto] = useState(false);

  const voice = useVoiceRoom(socket, me) as VoiceRoom;

  useEffect(() => {
    const s = connectSocket();
    setSocket(s);

    const onChannelCreated = (channel: Channel) =>
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]
      );

    const onChannelDeleted = ({ id }: { id: string }) => {
      setChannels((prev) => {
        const restantes = prev.filter((c) => c.id !== id);
        // Apagaram o canal aberto: cai para outro de texto em vez de deixar
        // a tela vazia com canais existindo na barra ao lado.
        setActiveId((atual) =>
          atual === id ? restantes.find((c) => c.type === 'TEXT')?.id ?? null : atual
        );
        return restantes;
      });
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

    const onMemberJoined = (user: User) =>
      setUsers((prev) => ({ ...prev, [user.id]: user }));

    const onMemberUpdated = (user: User) => {
      setUsers((prev) => ({ ...prev, [user.id]: user }));
      // Promoveram ou rebaixaram voce com a aba aberta: as permissoes vem
      // do servidor, entao e so pedir de novo em vez de recalcular no front.
      if (user.id === me.id) {
        onMeUpdated(user);
        api.bootstrap().then((b) => setPermissions(b.permissions)).catch(() => {});
      }
    };

    const onMemberRemoved = ({ id }: { id: string }) => {
      // Expulsaram voce: o token ja nao vale nada no servidor.
      if (id === me.id) return onLogout();
      setUsers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setVoiceStates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    s.on('channel:created', onChannelCreated);
    s.on('channel:deleted', onChannelDeleted);
    s.on('voice:peer-joined', onPeerJoined);
    s.on('voice:peer-left', onPeerLeft);
    s.on('voice:state', onVoiceState);
    s.on('member:joined', onMemberJoined);
    s.on('member:updated', onMemberUpdated);
    s.on('member:removed', onMemberRemoved);

    return () => {
      s.off('channel:created', onChannelCreated);
      s.off('channel:deleted', onChannelDeleted);
      s.off('voice:peer-joined', onPeerJoined);
      s.off('voice:peer-left', onPeerLeft);
      s.off('voice:state', onVoiceState);
      s.off('member:joined', onMemberJoined);
      s.off('member:updated', onMemberUpdated);
      s.off('member:removed', onMemberRemoved);
      disconnectSocket();
    };
  }, [me.id, onLogout, onMeUpdated]);

  useEffect(() => {
    api
      .bootstrap()
      .then(({ channels, users, voiceStates, permissions }) => {
        setPermissions(permissions);
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

  const criarCanal = useCallback(async (nome: string, tipo: ChannelType) => {
    const criado = await api.createChannel({ name: nome, type: tipo });
    // O channel:created do socket ja insere na lista (e deduplica por id);
    // aqui so levamos quem criou para dentro do canal de texto novo.
    if (criado.type === 'TEXT') setActiveId(criado.id);
  }, []);

  const apagarCanal = useCallback(async (canal: Channel) => {
    const ehVoz = canal.type === 'VOICE';
    const ok = window.confirm(
      `Apagar #${canal.name}?\n\n` +
        (ehVoz
          ? 'Quem estiver na chamada cai.'
          : 'As mensagens desse canal vão junto — o banco apaga em cascata.') +
        '\nNão dá para desfazer.'
    );
    if (!ok) return;
    await api.deleteChannel(canal.id);
  }, []);

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
        {(permissions.includes('MANAGE_ROLES') ||
          permissions.includes('KICK_MEMBER') ||
          permissions.includes('CREATE_INVITE')) && (
          <button className="admin-abrir" onClick={() => setAdminAberto(true)}>
            Membros e convites
          </button>
        )}

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
          permissions={permissions}
          onCreateChannel={criarCanal}
          onDeleteChannel={apagarCanal}
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
            <p>
              {permissions.includes('MANAGE_CHANNELS')
                ? 'Nenhum canal de texto ainda. Use o + ao lado de "Canais de texto".'
                : 'Nenhum canal de texto ainda. Peça para alguém que administra criar um.'}
            </p>
          </div>
        )}
      </main>

      {adminAberto && (
        <AdminPanel
          me={me}
          users={Object.values(users).sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
          )}
          permissions={permissions}
          onClose={() => setAdminAberto(false)}
        />
      )}
    </div>
  );
}
