import { useEffect, useRef, useState, useCallback } from 'react';
import {
  captureMicrophone,
  captureScreen,
  tuneVideoSender,
  preferCodecs,
  detectSpeaking,
  readStats,
  PRESETS,
} from '../lib/media.js';
import { apiUrl } from '../lib/config';

/**
 * Malha P2P: cada participante mantem uma RTCPeerConnection com cada outro.
 * Para 2-6 pessoas isso e o melhor arranjo possivel — latencia minima,
 * qualidade maxima e zero banda no servidor.
 *
 * Acima de ~6 o upload de quem compartilha tela vira gargalo (ele envia o
 * mesmo video N vezes). Esse e o momento de trocar por um SFU, e a troca
 * mexe so neste arquivo.
 */
export function useVoiceRoom(socket, me) {
  const [peers, setPeers] = useState({});       // userId -> { stream, screenStream }
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState({}); // userId -> boolean, inclui voce
  const [presetName, setPresetName] = useState('equilibrado');
  const [localScreen, setLocalScreen] = useState(null);
  const [stats, setStats] = useState({});       // userId -> { outbound, inbound }

  const pcs = useRef(new Map());                // userId -> RTCPeerConnection
  const micStream = useRef(null);
  const screenStream = useRef(null);
  const screenSenders = useRef(new Map());      // userId -> RTCRtpSender
  const iceConfig = useRef(null);

  // Candidatos que chegaram antes da descricao remota. addIceCandidate
  // rejeita nesse estado, e quem oferta SEMPRE recebe candidatos do outro
  // lado antes de processar a answer. Sem esta fila a conexao fecha as
  // vezes e falha as vezes, sem padrao aparente.
  const pendingIce = useRef(new Map());         // userId -> RTCIceCandidate[]

  // Uma limpeza de detectSpeaking por stream analisado.
  const speakingStops = useRef(new Map());      // userId -> () => void

  const watchSpeaking = useCallback((userId, stream) => {
    speakingStops.current.get(userId)?.();
    const stop = detectSpeaking(stream, (isSpeaking) => {
      setSpeaking((prev) =>
        prev[userId] === isSpeaking ? prev : { ...prev, [userId]: isSpeaking }
      );
    });
    speakingStops.current.set(userId, stop);
  }, []);

  const unwatchSpeaking = useCallback((userId) => {
    speakingStops.current.get(userId)?.();
    speakingStops.current.delete(userId);
    setSpeaking((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  /** Descarrega os candidatos represados assim que a descricao remota entra. */
  const flushIce = useCallback(async (peerId, pc) => {
    const queued = pendingIce.current.get(peerId);
    if (!queued) return;
    pendingIce.current.delete(peerId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('candidato ICE represado foi recusado', err);
      }
    }
  }, []);

  const getIceConfig = useCallback(async () => {
    if (!iceConfig.current) {
      const res = await fetch(apiUrl('/ice'), { headers: authHeader() });
      iceConfig.current = await res.json();
    }
    return iceConfig.current;
  }, []);

  const createPeer = useCallback(async (peerId, isInitiator) => {
    if (pcs.current.has(peerId)) return pcs.current.get(peerId);

    const config = await getIceConfig();
    const pc = new RTCPeerConnection({
      ...config,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    pcs.current.set(peerId, pc);

    // Microfone entra sempre.
    micStream.current?.getAudioTracks().forEach((t) => {
      pc.addTrack(t, micStream.current);
    });

    // Reserva um transceiver de video ja no inicio. Assim, quando alguem
    // comecar a compartilhar tela, so trocamos a track (replaceTrack) em
    // vez de renegociar tudo — a tela aparece quase instantaneamente.
    //
    // So quem oferta cria. Do lado que responde o transceiver de video nasce
    // junto com a descricao remota; criar um aqui tambem deixa um orfao sem
    // mid, fora do SDP, e e nele que o screenSenders acabaria apontando —
    // replaceTrack funcionaria e ninguem receberia nada.
    if (isInitiator) {
      const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
      preferCodecs(videoTx);
      screenSenders.current.set(peerId, videoTx.sender);

      // Se ja estamos compartilhando quando alguem entra, ele ja recebe.
      if (screenStream.current) {
        const track = screenStream.current.getVideoTracks()[0];
        await videoTx.sender.replaceTrack(track);
        await tuneVideoSender(videoTx.sender, currentPreset.current);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voice:ice', { to: peerId, payload: e.candidate });
    };

    pc.ontrack = (e) => {
      // Faixa reservada com addTransceiver nao tem stream associado: sem
      // msid no SDP, o ontrack do outro lado chega com e.streams vazio. O
      // audio escapa porque addTrack(t, micStream) leva o msid junto; o
      // video da tela, nao. Sem este fallback os bytes chegam e o video
      // nao tem onde ser pendurado.
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setPeers((prev) => ({
        ...prev,
        [peerId]: {
          ...prev[peerId],
          [e.track.kind === 'video' ? 'screenStream' : 'stream']: stream,
        },
      }));
      // O anel verde do outro sai do audio que chega dele, nao de um evento
      // do servidor: e o que a gente realmente esta ouvindo.
      if (e.track.kind === 'audio') watchSpeaking(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // ICE restart resolve a maioria das quedas (troca de wifi, etc)
        if (pc.connectionState === 'failed' && isInitiator) {
          pc.restartIce();
        }
      }
    };

    // Renegociacao automatica. So o iniciador oferece, pra evitar colisao.
    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        socket.emit('voice:offer', { to: peerId, payload: pc.localDescription });
      } catch (err) {
        console.error('Falha ao renegociar', err);
      }
    };

    return pc;
  }, [socket, getIceConfig]);

  const currentPreset = useRef(PRESETS.equilibrado);

  /**
   * Do lado que responde, o transceiver de video chega recvonly junto com a
   * oferta. Abrir para sendrecv ANTES de montar a answer e o que deixa este
   * lado compartilhar tela depois so com replaceTrack — sem renegociar.
   */
  const adoptVideoTransceiver = useCallback(async (peerId, pc) => {
    const videoTx = pc
      .getTransceivers()
      .find((t) => t.receiver.track?.kind === 'video');
    if (!videoTx) return;

    videoTx.direction = 'sendrecv';
    preferCodecs(videoTx);
    screenSenders.current.set(peerId, videoTx.sender);

    if (screenStream.current) {
      await videoTx.sender.replaceTrack(screenStream.current.getVideoTracks()[0]);
      await tuneVideoSender(videoTx.sender, currentPreset.current);
    }
  }, []);

  /* --------------------------- entrar / sair --------------------------- */

  const join = useCallback(async (targetChannelId) => {
    // O microfone precisa existir antes do voice:join: os outros comecam a
    // ofertar assim que o servidor anuncia a entrada, e uma oferta sem
    // faixa de audio nasce com as m-lines trocadas.
    if (!micStream.current) {
      micStream.current = await captureMicrophone();
    }
    micStream.current.getAudioTracks().forEach((t) => (t.enabled = !muted));
    watchSpeaking(me.id, micStream.current);

    return new Promise((resolve, reject) => {
      socket.emit('voice:join', { channelId: targetChannelId }, async ({ ok, data, error }) => {
        if (!ok) {
          unwatchSpeaking(me.id);
          micStream.current?.getTracks().forEach((t) => t.stop());
          micStream.current = null;
          return reject(new Error(error));
        }
        setChannelId(targetChannelId);
        setConnected(true);
        // Quem chega e o iniciador com todo mundo que ja estava.
        for (const peer of data.peers) {
          await createPeer(peer.id, true);
        }
        resolve(data);
      });
    });
  }, [socket, createPeer, me.id, muted, watchSpeaking, unwatchSpeaking]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    screenSenders.current.clear();
    pendingIce.current.clear();
    speakingStops.current.forEach((stop) => stop());
    speakingStops.current.clear();
    micStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    screenStream.current = null;
    statsAnteriores.current.clear();
    setPeers({});
    setSpeaking({});
    setStats({});
    setConnected(false);
    setChannelId(null);
    setLocalScreen(null);
    setSharing(false);
  }, [socket]);

  /**
   * Mudo de verdade: a faixa para de mandar audio. Nao e so um icone —
   * `enabled = false` faz o navegador enviar silencio, sem renegociar nada.
   */
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      micStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      if (next) {
        setSpeaking((s) => (s[me.id] ? { ...s, [me.id]: false } : s));
      }
      socket.emit('voice:state', { muted: next });
      return next;
    });
  }, [socket, me.id]);

  /* --------------------------- tela ------------------------------------ */

  const startScreenShare = useCallback(async (opts = {}) => {
    // Cancelar o seletor do navegador rejeita aqui. Deixa subir: quem chamou
    // sabe distinguir "desisti" de "deu errado" melhor que o hook.
    const escolhido = opts.preset ?? presetName;
    const { stream, preset } = await captureScreen({ ...opts, preset: escolhido });
    screenStream.current = stream;
    currentPreset.current = preset;

    const track = stream.getVideoTracks()[0];

    // replaceTrack em todos os peers: sem renegociar, sem travar o audio.
    await Promise.all(
      [...screenSenders.current.entries()].map(async ([, sender]) => {
        await sender.replaceTrack(track);
        await tuneVideoSender(sender, preset);
      })
    );

    // O usuario clicou em "parar de compartilhar" na barra do navegador/SO.
    track.onended = () => stopScreenShare();

    setPresetName(escolhido);
    setLocalScreen(stream);
    setSharing(true);
    socket.emit('voice:state', { streaming: true });
  }, [socket, presetName]);

  const stopScreenShare = useCallback(async () => {
    screenStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current = null;
    await Promise.all(
      [...screenSenders.current.values()].map((s) => s.replaceTrack(null))
    );
    setLocalScreen(null);
    setSharing(false);
    socket.emit('voice:state', { streaming: false });
  }, [socket]);

  /** Troca o preset ao vivo, sem derrubar a transmissao. */
  const changeQuality = useCallback(async (nome) => {
    const preset = PRESETS[nome];
    if (!preset) return;
    setPresetName(nome);

    // Sem transmissao rolando, o preset fica guardado para o proximo start.
    if (!screenStream.current) return;
    currentPreset.current = preset;

    const track = screenStream.current.getVideoTracks()[0];
    track.contentHint = preset.contentHint;
    await track.applyConstraints({
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    });
    await Promise.all(
      [...screenSenders.current.values()].map((s) => tuneVideoSender(s, preset))
    );
  }, []);

  /**
   * Amostragem de 1s das estatisticas. Bitrate precisa de duas leituras, entao
   * a anterior fica guardada aqui. So roda em chamada — sem ninguem na sala
   * nao ha o que medir.
   */
  const statsAnteriores = useRef(new Map());    // userId -> amostra

  useEffect(() => {
    if (!connected) {
      statsAnteriores.current.clear();
      setStats({});
      return;
    }

    let vivo = true;
    const timer = setInterval(async () => {
      const leituras = await Promise.all(
        [...pcs.current.entries()].map(async ([peerId, pc]) => {
          const amostra = await readStats(pc, statsAnteriores.current.get(peerId));
          statsAnteriores.current.set(peerId, amostra);
          return [peerId, amostra];
        })
      );
      if (vivo) setStats(Object.fromEntries(leituras));
    }, 1000);

    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [connected]);

  /* --------------------------- sinalizacao ----------------------------- */

  useEffect(() => {
    if (!socket) return;

    const onPeerJoined = () => { /* quem entra e que oferece; aqui so esperamos */ };

    const onOffer = async ({ from, payload }) => {
      const pc = await createPeer(from, false);
      await pc.setRemoteDescription(payload);
      await adoptVideoTransceiver(from, pc);
      await flushIce(from, pc);
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit('voice:answer', { to: from, payload: pc.localDescription });
    };

    const onAnswer = async ({ from, payload }) => {
      const pc = pcs.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(payload);
      await flushIce(from, pc);
    };

    const onIce = async ({ from, payload }) => {
      const pc = pcs.current.get(from);

      // Sem descricao remota o candidato nao entra. Guarda em vez de perder.
      if (!pc || !pc.remoteDescription) {
        const queue = pendingIce.current.get(from) ?? [];
        queue.push(payload);
        pendingIce.current.set(from, queue);
        return;
      }

      try { await pc.addIceCandidate(payload); }
      catch (err) { console.warn('candidato ICE descartado', err); }
    };

    const onPeerLeft = ({ userId }) => {
      pcs.current.get(userId)?.close();
      pcs.current.delete(userId);
      screenSenders.current.delete(userId);
      pendingIce.current.delete(userId);
      unwatchSpeaking(userId);
      setPeers((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    };

    socket.on('voice:peer-joined', onPeerJoined);
    socket.on('voice:offer', onOffer);
    socket.on('voice:answer', onAnswer);
    socket.on('voice:ice', onIce);
    socket.on('voice:peer-left', onPeerLeft);

    return () => {
      socket.off('voice:peer-joined', onPeerJoined);
      socket.off('voice:offer', onOffer);
      socket.off('voice:answer', onAnswer);
      socket.off('voice:ice', onIce);
      socket.off('voice:peer-left', onPeerLeft);
    };
  }, [socket, createPeer, flushIce, adoptVideoTransceiver, unwatchSpeaking]);

  // Fechar a aba no meio da chamada nao pode deixar o microfone ligado nem
  // as conexoes penduradas do outro lado.
  useEffect(() => {
    return () => {
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      speakingStops.current.forEach((stop) => stop());
      speakingStops.current.clear();
      micStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    peers,
    connected,
    channelId,
    muted,
    speaking,
    sharing,
    localScreen,
    presetName,
    stats,
    join,
    leave,
    toggleMute,
    startScreenShare,
    stopScreenShare,
    changeQuality,
  };
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` };
}
