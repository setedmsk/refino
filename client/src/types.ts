export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type User = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  role: Role;
};

export type Channel = {
  id: string;
  name: string;
  type: 'TEXT' | 'VOICE';
  position: number;
  topic: string | null;
};

export type Attachment = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type Message = {
  id: string;
  content: string;
  channelId: string;
  createdAt: string;
  editedAt: string | null;
  author: User;
  attachments: Attachment[];
};

export type VoiceState = {
  userId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  cameraOn: boolean;
};

export type Bootstrap = {
  channels: Channel[];
  users: User[];
  voiceStates: VoiceState[];
};

/** Formato do ack de todo handler de socket guardado por guardSocket. */
export type Ack<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
