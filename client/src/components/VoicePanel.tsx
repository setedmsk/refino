import { useEffect, useRef, useState } from 'react';
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
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  async function onToggleShare() {
    setShareError(null);
    setShareBusy(true);
    try {
      if (voice.sharing) await voice.stopScreenShare();
      else await voice.startScreenShare();
    } catch (err) {
      // Fechar o seletor do navegador cai aqui como NotAllowedError. Isso e
      // desistencia, nao falha — nao vale poluir a tela com erro vermelho.
      const nome = err instanceof DOMException ? err.name : '';
      if (nome !== 'NotAllowedError' && nome !== 'AbortError') {
        setShareError(err instanceof Error ? err.message : 'Não deu para compartilhar.');
      }
    } finally {
      setShareBusy(false);
    }
  }

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
              {presence.streaming && <span className="tag live">tela</span>}
              {presence.muted && <span className="tag">mudo</span>}
            </li>
          );
        })}
      </ul>

      <div className="voice-controls">
        <button onClick={voice.toggleMute} className={voice.muted ? 'on' : undefined}>
          {voice.muted ? 'Ativar microfone' : 'Silenciar'}
        </button>
        <button onClick={onToggleShare} disabled={shareBusy}>
          {voice.sharing ? 'Parar tela' : 'Compartilhar tela'}
        </button>
        <button onClick={voice.leave} className="danger">
          Sair
        </button>
      </div>

      {shareError && <p className="error voice-error">{shareError}</p>}

      {Object.entries(voice.peers).map(([peerId, p]) =>
        p.stream ? <PeerAudio key={peerId} stream={p.stream} muted={false} /> : null
      )}
    </section>
  );
}
