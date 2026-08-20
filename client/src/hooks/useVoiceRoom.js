import { useEffect, useRef, useState, useCallback } from 'react';
import { captureMicrophone, captureScreen, tuneVideoSender, preferCodecs, PRESETS } from '../lib/media.js';

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

  const pcs = useRef(new Map());                // userId -> RTCPeerConnection
  const micStream = useRef(null);
  const screenStream = useRef(null);
  const screenSenders = useRef(new Map());      // userId -> RTCRtpSender
  const iceConfig = useRef(null);

  const getIceConfig = useCallback(async () => {
    if (!iceConfig.current) {
      const res = await fetch('/api/ice', { headers: authHeader() });
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
    const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    preferCodecs(videoTx);
    screenSenders.current.set(peerId, videoTx.sender);

    // Se ja estamos compartilhando quando alguem entra, ele ja recebe.
    if (screenStream.current) {
      const track = screenStream.current.getVideoTracks()[0];
      await videoTx.sender.replaceTrack(track);
      await tuneVideoSender(videoTx.sender, currentPreset.current);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voice:ice', { to: peerId, payload: e.candidate });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      setPeers((prev) => ({
        ...prev,
        [peerId]: {
          ...prev[peerId],
          [e.track.kind === 'video' ? 'screenStream' : 'stream']: stream,
        },
      }));
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

  /* --------------------------- entrar / sair --------------------------- */

  const join = useCallback(async (channelId) => {
    micStream.current = await captureMicrophone();

    socket.emit('voice:join', { channelId }, async ({ ok, data, error }) => {
      if (!ok) return console.error(error);
      setConnected(true);
      // Quem chega e o iniciador com todo mundo que ja estava.
      for (const peer of data.peers) {
        await createPeer(peer.id, true);
      }
    });
  }, [socket, createPeer]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    screenSenders.current.clear();
    micStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    screenStream.current = null;
    setPeers({});
    setConnected(false);
    setSharing(false);
  }, [socket]);

  /* --------------------------- tela ------------------------------------ */

  const startScreenShare = useCallback(async (opts = {}) => {
    const { stream, preset } = await captureScreen(opts);
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

    setSharing(true);
    socket.emit('voice:state', { streaming: true });
  }, [socket]);

  const stopScreenShare = useCallback(async () => {
    screenStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current = null;
    await Promise.all(
      [...screenSenders.current.values()].map((s) => s.replaceTrack(null))
    );
    setSharing(false);
    socket.emit('voice:state', { streaming: false });
  }, [socket]);

  /** Troca o preset ao vivo, sem derrubar a transmissao. */
  const changeQuality = useCallback(async (presetName) => {
    const preset = PRESETS[presetName];
    if (!preset || !screenStream.current) return;
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

  /* --------------------------- sinalizacao ----------------------------- */

  useEffect(() => {
    if (!socket) return;

    const onPeerJoined = () => { /* quem entra e que oferece; aqui so esperamos */ };

    const onOffer = async ({ from, payload }) => {
      const pc = await createPeer(from, false);
      await pc.setRemoteDescription(payload);
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit('voice:answer', { to: from, payload: pc.localDescription });
    };

    const onAnswer = async ({ from, payload }) => {
      await pcs.current.get(from)?.setRemoteDescription(payload);
    };

    const onIce = async ({ from, payload }) => {
      try { await pcs.current.get(from)?.addIceCandidate(payload); }
      catch (err) { console.warn('candidato ICE descartado', err); }
    };

    const onPeerLeft = ({ userId }) => {
      pcs.current.get(userId)?.close();
      pcs.current.delete(userId);
      screenSenders.current.delete(userId);
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
  }, [socket, createPeer]);

  return { peers, connected, sharing, join, leave, startScreenShare, stopScreenShare, changeQuality };
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` };
}
