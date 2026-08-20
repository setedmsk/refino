import { useEffect, useRef } from 'react';
import type { PeerStats, PresetName } from '../types';

const PRESET_LABEL: Record<PresetName, string> = {
  leitura: 'Leitura · 1440p15',
  equilibrado: 'Equilibrado · 1080p30',
  jogo: 'Jogo · 1080p60',
  maximo: 'Máximo · 1440p60',
};

// O campo mais util do getStats para diagnosticar tela: diz quem esta
// segurando a qualidade quando ela cai sozinha.
const LIMITE: Record<string, string> = {
  none: 'nenhum',
  bandwidth: 'banda',
  cpu: 'CPU',
  other: 'outro',
};

/*
 * Qual lado ler nao e negociavel: quem envia so tem verdade no outbound,
 * quem assiste so tem verdade no inbound. Escolher com `??` pega o outbound
 * vazio de quem esta apenas recebendo — o transceiver e sendrecv, entao ele
 * reporta um outbound-rtp zerado o tempo todo.
 */
function Linha({
  label,
  s,
  lado,
}: {
  label: string;
  s: PeerStats | undefined;
  lado: 'outbound' | 'inbound';
}) {
  const d = lado === 'outbound' ? s?.outbound ?? null : s?.inbound ?? null;
  if (!d) return null;

  const limite =
    s?.outbound?.qualityLimitation != null && lado === 'outbound'
      ? LIMITE[s.outbound.qualityLimitation] ?? s.outbound.qualityLimitation
      : null;

  const perdidos = lado === 'inbound' ? s?.inbound?.packetsLost : undefined;

  return (
    <div className="stat-line">
      {label && <span className="stat-who">{label}</span>}
      <span>
        {d.frameWidth && d.frameHeight ? `${d.frameWidth}×${d.frameHeight}` : '—'}
      </span>
      <span>{d.framesPerSecond != null ? `${Math.round(d.framesPerSecond)} fps` : '— fps'}</span>
      <span className="stat-rate">
        {d.bitrateKbps != null ? `${d.bitrateKbps} kbps` : 'medindo…'}
      </span>
      {limite && (
        <span className={limite === 'nenhum' ? undefined : 'stat-alerta'}>
          limite: {limite}
        </span>
      )}
      {perdidos != null && perdidos > 0 && (
        <span className="stat-alerta">{perdidos} perdidos</span>
      )}
    </div>
  );
}

type Props = {
  stream: MediaStream;
  title: string;
  isLocal: boolean;
  presetName: PresetName;
  onChangePreset: (p: PresetName) => void;
  onStop: () => void;
  /** Quando local, uma entrada por peer; quando remoto, so a do dono da tela. */
  stats: Array<{ label: string; sample: PeerStats | undefined }>;
};

export function ScreenStage({
  stream,
  title,
  isLocal,
  presetName,
  onChangePreset,
  onStop,
  stats,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    el.play().catch((err) => console.warn('video nao tocou', err));
  }, [stream]);

  return (
    <section className="stage">
      <div className="stage-video">
        {/* O proprio preview vai mudo: ouvir a si mesmo e eco garantido. */}
        <video ref={ref} autoPlay playsInline muted={isLocal} />

        <div className="stage-hud">
          <div className="hud-title">{title}</div>
          {stats.map(({ label, sample }) => (
            <Linha
              key={label || 'unico'}
              label={label}
              s={sample}
              lado={isLocal ? 'outbound' : 'inbound'}
            />
          ))}
        </div>
      </div>

      {isLocal && (
        <div className="stage-controls">
          <label>
            Qualidade
            <select
              value={presetName}
              onChange={(e) => onChangePreset(e.target.value as PresetName)}
            >
              {(Object.keys(PRESET_LABEL) as PresetName[]).map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <button className="danger" onClick={onStop}>
            Parar de compartilhar
          </button>
        </div>
      )}
    </section>
  );
}
