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

/** Onde cada pessoa esta em voz agora, do ponto de vista da barra lateral. */
export type VoicePresence = {
  channelId: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  cameraOn: boolean;
};

/** O que o hook de voz devolve. O arquivo e .js, entao o contrato mora aqui. */
export type VoiceRoom = {
  peers: Record<string, { stream?: MediaStream; screenStream?: MediaStream }>;
  connected: boolean;
  channelId: string | null;
  muted: boolean;
  speaking: Record<string, boolean>;
  sharing: boolean;
  join: (channelId: string) => Promise<unknown>;
  leave: () => void;
  toggleMute: () => void;
};
