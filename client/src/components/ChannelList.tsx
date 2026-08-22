import { useState, type FormEvent } from 'react';
import type { Channel, ChannelType, Permission, User, VoicePresence } from '../types';
import { Avatar } from './Avatar';

type Props = {
  channels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  me: User;
  onLogout: () => void;
  voiceMembers: (channelId: string) => Array<{ user: User; presence: VoicePresence }>;
  onJoinVoice: (channelId: string) => void;
  voiceChannelId: string | null;
  speaking: Record<string, boolean>;
  permissions: Permission[];
  onCreateChannel: (name: string, type: ChannelType) => Promise<void>;
  onDeleteChannel: (channel: Channel) => Promise<void>;
};

export function ChannelList({
  channels,
  activeId,
  onSelect,
  me,
  onLogout,
  voiceMembers,
  onJoinVoice,
  voiceChannelId,
  speaking,
  permissions,
  onCreateChannel,
  onDeleteChannel,
}: Props) {
  const podeGerenciar = permissions.includes('MANAGE_CHANNELS');
  const [criando, setCriando] = useState<ChannelType | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!criando || !nome.trim()) return;
    setErro(null);
    setOcupado(true);
    try {
      await onCreateChannel(nome, criando);
      setNome('');
      setCriando(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para criar.');
    } finally {
      setOcupado(false);
    }
  }

  function abrirForm(tipo: ChannelType) {
    setErro(null);
    setNome('');
    setCriando((atual) => (atual === tipo ? null : tipo));
  }

  const formDe = (tipo: ChannelType) =>
    criando === tipo && (
      <form className="novo-canal" onSubmit={criar}>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setCriando(null)}
          placeholder={tipo === 'TEXT' ? 'assuntos-gerais' : 'sala 2'}
          maxLength={32}
          disabled={ocupado}
        />
        {/* O servidor normaliza: minusculas, espacos viram hifen, o resto cai. */}
        {nome.trim() && <small>vai virar #{slugPrevia(nome)}</small>}
        {erro && <small className="error">{erro}</small>}
      </form>
    );

  const cabecalho = (titulo: string, tipo: ChannelType) => (
    <h2>
      {titulo}
      {podeGerenciar && (
        <button
          className="add"
          title={`Criar canal de ${tipo === 'TEXT' ? 'texto' : 'voz'}`}
          onClick={() => abrirForm(tipo)}
        >
          {criando === tipo ? '×' : '+'}
        </button>
      )}
    </h2>
  );

  const botaoApagar = (c: Channel) =>
    podeGerenciar && (
      <button
        className="apagar"
        title="Apagar canal"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteChannel(c);
        }}
      >
        ×
      </button>
    );

  const text = channels.filter((c) => c.type === 'TEXT');
  const voice = channels.filter((c) => c.type === 'VOICE');

  return (
    <nav className="sidebar">
      <div className="sidebar-scroll">
        {cabecalho('Canais de texto', 'TEXT')}
        {formDe('TEXT')}
        {text.length === 0 && criando !== 'TEXT' && (
          <p className="empty">Nenhum canal ainda.</p>
        )}
        <ul>
          {text.map((c) => (
            <li key={c.id} className="channel-row">
              <button
                className={c.id === activeId ? 'channel active' : 'channel'}
                onClick={() => onSelect(c.id)}
              >
                <span className="hash">#</span>
                {c.name}
              </button>
              {botaoApagar(c)}
            </li>
          ))}
        </ul>

        {cabecalho('Canais de voz', 'VOICE')}
        {formDe('VOICE')}
        {voice.length === 0 && criando !== 'VOICE' && (
          <p className="empty">Nenhum canal ainda.</p>
        )}
        <ul>
          {voice.map((c) => {
            const members = voiceMembers(c.id);
            return (
              <li key={c.id}>
                <div className="channel-row">
                  <button
                    className={c.id === voiceChannelId ? 'channel active' : 'channel'}
                    onClick={() => onJoinVoice(c.id)}
                  >
                    <span className="hash">♪</span>
                    {c.name}
                    {members.length > 0 && (
                      <span className="voice-count">{members.length}</span>
                    )}
                  </button>
                  {botaoApagar(c)}
                </div>

                {members.length > 0 && (
                  <ul className="voice-roster">
                    {members.map(({ user, presence }) => (
                      <li
                        key={user.id}
                        className={
                          speaking[user.id] && !presence.muted ? 'speaking' : undefined
                        }
                      >
                        <span className="ring">
                          <Avatar user={user} size={22} />
                        </span>
                        {user.displayName}
                        {presence.streaming && <span className="tag live">tela</span>}
                        {presence.muted && <span className="tag">mudo</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="me">
        <Avatar user={me} />
        <span className="me-name">
          {me.displayName}
          <small>{me.role.toLowerCase()}</small>
        </span>
        <button className="link" onClick={onLogout}>
          sair
        </button>
      </footer>
    </nav>
  );
}

/** Espelha o slug() do servidor, so para mostrar antes de criar. */
function slugPrevia(nome: string) {
  return (
    nome
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 32) || 'canal'
  );
}
