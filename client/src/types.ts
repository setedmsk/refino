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
  /**
   * O que ESTE usuario pode, ja resolvido pelo permissions.js do servidor.
   * Serve so para esconder botao — toda rota confere de novo por conta.
   */
  permissions: Permission[];
};

export type Permission =
  | 'SEND_MESSAGE'
  | 'DELETE_OWN_MESSAGE'
  | 'JOIN_VOICE'
  | 'SHARE_SCREEN'
  | 'UPLOAD_FILE'
  | 'MANAGE_CHANNELS'
  | 'DELETE_ANY_MESSAGE'
  | 'KICK_MEMBER'
  | 'CREATE_INVITE'
  | 'MOVE_VOICE_MEMBER'
  | 'SERVER_MUTE'
  | 'MANAGE_ROLES'
  | 'MANAGE_SERVER';

export type Invite = {
  id: string;
  code: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
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
  localScreen: MediaStream | null;
  presetName: PresetName;
  stats: Record<string, PeerStats>;
  join: (channelId: string) => Promise<unknown>;
  leave: () => void;
  toggleMute: () => void;
  startScreenShare: (opts?: { preset?: PresetName }) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  changeQuality: (preset: PresetName) => Promise<void>;
};

export type OutboundVideoStats = {
  bytes: number;
  bitrateKbps: number | null;
  framesPerSecond: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  qualityLimitation: string | null;
};

export type InboundVideoStats = {
  bytes: number;
  bitrateKbps: number | null;
  framesPerSecond: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  packetsLost: number;
};

export type PeerStats = {
  at: number;
  outbound: OutboundVideoStats | null;
  inbound: InboundVideoStats | null;
};

export type PresetName = 'leitura' | 'equilibrado' | 'jogo' | 'maximo';
