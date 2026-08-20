import type { Channel, User, VoicePresence } from '../types';
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
}: Props) {
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
              {voice.map((c) => {
                const members = voiceMembers(c.id);
                return (
                  <li key={c.id}>
                    <button
                      className={
                        c.id === voiceChannelId ? 'channel active' : 'channel'
                      }
                      onClick={() => onJoinVoice(c.id)}
                    >
                      <span className="hash">♪</span>
                      {c.name}
                      {members.length > 0 && (
                        <span className="voice-count">{members.length}</span>
                      )}
                    </button>

                    {members.length > 0 && (
                      <ul className="voice-roster">
                        {members.map(({ user, presence }) => (
                          <li
                            key={user.id}
                            className={
                              speaking[user.id] && !presence.muted
                                ? 'speaking'
                                : undefined
                            }
                          >
                            <span className="ring">
                              <Avatar user={user} size={22} />
                            </span>
                            {user.displayName}
                            {presence.muted && <span className="tag">mudo</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
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
