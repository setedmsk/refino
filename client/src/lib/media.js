/**
 * Captura e ajuste de qualidade.
 *
 * O navegador degrada tela compartilhada de forma agressiva por padrao.
 * Sem os ajustes daqui, texto pequeno vira borrao e jogo vira slideshow.
 * Este arquivo e o que separa "funciona" de "parece o Discord".
 */

export const PRESETS = {
  // Ler codigo, planilha, documento. Prioriza nitidez, aceita menos fps.
  leitura: { width: 2560, height: 1440, frameRate: 15, bitrate: 5_000_000, contentHint: 'detail' },
  // Uso geral. O equilibrio.
  equilibrado: { width: 1920, height: 1080, frameRate: 30, bitrate: 6_000_000, contentHint: 'motion' },
  // Jogo. Prioriza fluidez.
  jogo: { width: 1920, height: 1080, frameRate: 60, bitrate: 10_000_000, contentHint: 'motion' },
  // So se todo mundo tem upload sobrando. Testa antes de prometer.
  maximo: { width: 2560, height: 1440, frameRate: 60, bitrate: 15_000_000, contentHint: 'motion' },
};

/**
 * No Electron, getDisplayMedia precisa do sourceId vindo do desktopCapturer
 * (exposto no preload como window.desktop). No navegador puro, o browser
 * mostra o proprio seletor de janelas.
 */
export async function captureScreen({ preset = 'equilibrado', sourceId = null, withAudio = true } = {}) {
  const p = PRESETS[preset] ?? PRESETS.equilibrado;

  const stream = sourceId
    ? await navigator.mediaDevices.getUserMedia({
        // caminho do Electron: constraints "chromeMediaSource" legadas
        audio: withAudio
          ? { mandatory: { chromeMediaSource: 'desktop' } }
          : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: p.width,
            maxHeight: p.height,
            maxFrameRate: p.frameRate,
          },
        },
      })
    : await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: p.width },
          height: { ideal: p.height },
          frameRate: { ideal: p.frameRate, max: p.frameRate },
        },
        audio: withAudio ? { channelCount: 2, echoCancellation: false, noiseSuppression: false } : false,
      });

  const track = stream.getVideoTracks()[0];

  // Diz ao encoder o que preservar quando a banda apertar.
  // 'detail' preserva resolucao (texto legivel), 'motion' preserva fps.
  track.contentHint = p.contentHint;

  return { stream, preset: p };
}

export async function captureMicrophone() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    },
  });
}

/**
 * O ajuste que quase todo clone esquece.
 *
 * Por padrao o Chromium limita tela compartilhada a ~2.5 Mbps e, quando a
 * rede aperta, ele DERRUBA A RESOLUCAO — 1080p vira 640x360 e nao volta.
 * 'maintain-resolution' inverte isso: ele sacrifica fps e mantem nitidez.
 */
export async function tuneVideoSender(sender, preset) {
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = preset.bitrate;
  params.encodings[0].maxFramerate = preset.frameRate;
  params.encodings[0].scaleResolutionDownBy = 1;
  params.degradationPreference =
    preset.contentHint === 'detail' ? 'maintain-resolution' : 'balanced';
  await sender.setParameters(params);
}

/**
 * Ordem de preferencia de codec. AV1 e VP9 rendem muito melhor em tela
 * (areas estaticas custam quase nada). H264 fica de rede de seguranca
 * porque tem aceleracao por hardware em praticamente tudo.
 */
export function preferCodecs(transceiver, order = ['video/AV1', 'video/VP9', 'video/H264', 'video/VP8']) {
  if (!RTCRtpSender.getCapabilities || !transceiver.setCodecPreferences) return;
  const available = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
  const ranked = order
    .flatMap((mime) => available.filter((c) => c.mimeType.toLowerCase() === mime.toLowerCase()));
  const rest = available.filter((c) => !ranked.includes(c));
  if (ranked.length) transceiver.setCodecPreferences([...ranked, ...rest]);
}

/**
 * Deteccao de fala para o anel verde em volta do avatar (igual ao video).
 * Roda local, sem custo de rede. Retorna funcao de limpeza.
 */
export function detectSpeaking(stream, onChange, { threshold = 12, hangMs = 220 } = {}) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  let quietSince = 0;
  let raf;

  const tick = () => {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (const v of data) sum += v;
    const level = sum / data.length;

    if (level > threshold) {
      quietSince = 0;
      if (!speaking) { speaking = true; onChange(true); }
    } else if (speaking) {
      quietSince ||= performance.now();
      if (performance.now() - quietSince > hangMs) { speaking = false; onChange(false); }
    }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => { cancelAnimationFrame(raf); ctx.close(); };
}

/**
 * Estatisticas reais da conexao, pra mostrar bitrate/fps na UI.
 *
 * Bitrate nao existe pronto no getStats: o que existe e um contador de bytes
 * que so cresce. O numero sai da diferenca entre duas leituras, por isso esta
 * funcao recebe a amostra anterior e devolve a atual para a proxima chamada.
 * Sem `anterior`, os bitrates vem null — e a primeira leitura, nao da pra
 * inventar taxa com um ponto so.
 */
export async function readStats(pc, anterior = null) {
  const report = await pc.getStats();
  const agora = { at: performance.now(), outbound: null, inbound: null };

  report.forEach((s) => {
    if (s.type === 'outbound-rtp' && s.kind === 'video') {
      agora.outbound = {
        bytes: s.bytesSent,
        framesPerSecond: s.framesPerSecond ?? null,
        frameWidth: s.frameWidth ?? null,
        frameHeight: s.frameHeight ?? null,
        // 'none' | 'bandwidth' | 'cpu' | 'other' — o campo que explica por
        // que a tela caiu de qualidade sem ninguem ter mexido em nada.
        qualityLimitation: s.qualityLimitationReason ?? null,
      };
    }
    if (s.type === 'inbound-rtp' && s.kind === 'video') {
      agora.inbound = {
        bytes: s.bytesReceived,
        framesPerSecond: s.framesPerSecond ?? null,
        frameWidth: s.frameWidth ?? null,
        frameHeight: s.frameHeight ?? null,
        packetsLost: s.packetsLost ?? 0,
      };
    }
  });

  const segundos = anterior ? (agora.at - anterior.at) / 1000 : 0;
  const taxa = (atual, antes) =>
    atual && antes && segundos > 0
      ? Math.max(0, Math.round(((atual.bytes - antes.bytes) * 8) / segundos / 1000))
      : null;

  return {
    ...agora,
    outbound: agora.outbound && {
      ...agora.outbound,
      bitrateKbps: taxa(agora.outbound, anterior?.outbound),
    },
    inbound: agora.inbound && {
      ...agora.inbound,
      bitrateKbps: taxa(agora.inbound, anterior?.inbound),
    },
  };
}
