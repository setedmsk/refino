import type { Channel, User } from '../types';
import { Avatar } from './Avatar';

type Props = {
  channels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  me: User;
  onLogout: () => void;
};

export function ChannelList({ channels, activeId, onSelect, me, onLogout }: Props) {
  const text = channels.filter((c) => c.type === 'TEXT');
  const voice = channels.filter((c) => c.type === 'VOICE');

  return (
    <nav className="sidebar">
      <div className="sidebar-scroll">
        <h2>Canais de texto</h2>
        {text.length === 0 && <p className="empty">Nenhum canal ainda.</p>}
        <ul>
          {text.map((c) => (
            <li key={c.id}>
              <button
                className={c.id === activeId ? 'channel active' : 'channel'}
                onClick={() => onSelect(c.id)}
              >
                <span className="hash">#</span>
                {c.name}
              </button>
            </li>
          ))}
        </ul>

        {voice.length > 0 && (
          <>
            <h2>Canais de voz</h2>
            <ul>
              {voice.map((c) => (
                <li key={c.id}>
                  {/* Etapa 3 liga isso. Aqui so aparece pra nao sumir da lista. */}
                  <button className="channel disabled" disabled title="Etapa 3">
                    <span className="hash">♪</span>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
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
