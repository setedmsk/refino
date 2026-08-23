import { useEffect, useRef, useState } from 'react';
import { isElectron } from '../lib/config';
import { SourcePicker } from './SourcePicker';
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

/*
 * O que mostrar quando a conexao com alguem nao esta de pe. 'connected' nao
 * aparece: o normal e silencio na interface. Aqui a gente so fala quando algo
 * esta errado — e "falhou" quase sempre quer dizer NAT sem TURN.
 */
const ESTADO: Partial<Record<RTCPeerConnectionState, { texto: string; ruim?: boolean }>> = {
  new: { texto: 'conectando…' },
  connecting: { texto: 'conectando…' },
  disconnected: { texto: 'reconectando…', ruim: true },
  failed: { texto: 'não conectou', ruim: true },
};

/** Depois disso, "conectando…" deixa de ser paciencia e vira diagnostico. */
const PACIENCIA_MS = 15_000;

type Props = {
  voice: VoiceRoom;
  channelName: string;
  me: User;
  members: Array<{ user: User; presence: VoicePresence }>;
};

export function VoicePanel({ voice, channelName, me, members }: Props) {
  // Um tique enquanto alguem nao conectou, so para o texto envelhecer sozinho.
  const [, tique] = useState(0);
  const esperando = members.some(
    ({ user }) => user.id !== me.id && voice.peerStates[user.id] !== 'connected'
  );
  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(() => tique((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, [esperando]);

  const [shareError, setShareError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);

  async function compartilhar(sourceId?: string) {
    setShareError(null);
    setShareBusy(true);
    try {
      await voice.startScreenShare(sourceId ? { sourceId } : {});
    } catch (err) {
      const nome = err instanceof DOMException ? err.name : '';
      if (nome !== 'NotAllowedError' && nome !== 'AbortError') {
        setShareError(err instanceof Error ? err.message : 'Não deu para compartilhar.');
      }
    } finally {
      setShareBusy(false);
    }
  }

  async function onToggleShare() {
    if (voice.sharing) {
      setShareBusy(true);
      try {
        await voice.stopScreenShare();
      } finally {
        setShareBusy(false);
      }
      return;
    }

    // No Electron a lista com miniatura e nossa; no navegador quem mostra o
    // seletor e o proprio Chrome e nao da para substituir.
    if (isElectron) return setPickerAberto(true);
    await compartilhar();
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
          let estado = user.id === me.id ? null : ESTADO[voice.peerStates[user.id]];
          // Sem candidato nenhum saindo, o Chromium nunca chega em 'failed'.
          // Passado o limite, dizemos o que quase sempre e: NAT sem TURN.
          const desde = voice.peerSince[user.id];
          if (
            estado &&
            !estado.ruim &&
            desde &&
            Date.now() - desde > PACIENCIA_MS
          ) {
            estado = { texto: 'não conectou — provável NAT, precisa de TURN', ruim: true };
          }
          return (
            <li key={user.id} className={falando ? 'speaking' : undefined}>
              <span className="ring">
                <Avatar user={user} size={40} />
              </span>
              <span className="voice-name">
                {user.displayName}
                {user.id === me.id && <small> você</small>}
                {estado && (
                  <small className={estado.ruim ? 'conexao ruim' : 'conexao'}>
                    {estado.texto}
                  </small>
                )}
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

      {pickerAberto && (
        <SourcePicker
          onClose={() => setPickerAberto(false)}
          onPick={(sourceId) => {
            setPickerAberto(false);
            compartilhar(sourceId);
          }}
        />
      )}

      {Object.entries(voice.peers).map(([peerId, p]) =>
        p.stream ? <PeerAudio key={peerId} stream={p.stream} muted={false} /> : null
      )}
    </section>
  );
}
