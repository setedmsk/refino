import { useEffect, useRef } from 'react';
import type { User, VoicePresence, VoiceRoom } from '../types';
import { Avatar } from './Avatar';

/**
 * O audio de cada peer precisa de um elemento de verdade tocando. Sem isso a
 * conexao fecha, os bytes chegam e ninguem ouve nada — que e o sintoma mais
 * enganoso do WebRTC.
 */
function PeerAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    // Entrar na chamada e um clique, entao a politica de autoplay deixa.
    el.play().catch((err) => console.warn('autoplay barrado', err));
  }, [stream]);

  return <audio ref={ref} autoPlay muted={muted} />;
}

type Props = {
  voice: VoiceRoom;
  channelName: string;
  me: User;
  members: Array<{ user: User; presence: VoicePresence }>;
};

export function VoicePanel({ voice, channelName, me, members }: Props) {
  return (
    <section className="voice-panel">
      <header>
        <span className="hash">♪</span>
        <strong>{channelName}</strong>
        <span className="voice-count">{members.length}</span>
      </header>

      <ul className="voice-members">
        {members.map(({ user, presence }) => {
          const falando = voice.speaking[user.id] === true && !presence.muted;
          return (
            <li key={user.id} className={falando ? 'speaking' : undefined}>
              <span className="ring">
                <Avatar user={user} size={40} />
              </span>
              <span className="voice-name">
                {user.displayName}
                {user.id === me.id && <small> você</small>}
              </span>
              {presence.muted && <span className="tag">mudo</span>}
            </li>
          );
        })}
      </ul>

      <div className="voice-controls">
        <button onClick={voice.toggleMute} className={voice.muted ? 'on' : undefined}>
          {voice.muted ? 'Ativar microfone' : 'Silenciar'}
        </button>
        <button onClick={voice.leave} className="danger">
          Sair da chamada
        </button>
      </div>

      {Object.entries(voice.peers).map(([peerId, p]) =>
        p.stream ? <PeerAudio key={peerId} stream={p.stream} muted={false} /> : null
      )}
    </section>
  );
}
