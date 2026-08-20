import type { User } from '../types';

/** Avatar de inicial, como o schema previu com avatarColor. */
export function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        background: user.avatarColor,
        width: size,
        height: size,
        fontSize: size * 0.45,
      }}
      title={`${user.displayName} (${user.role.toLowerCase()})`}
    >
      {user.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
