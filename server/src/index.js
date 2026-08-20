import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHmac } from 'crypto';

import { httpAuth, socketAuth, register, login, publicUser } from './auth.js';
import { can, requirePermission, guardSocket, assertCanActOn, HttpError } from './permissions.js';

const prisma = new PrismaClient();
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: process.env.CLIENT_ORIGIN ?? '*' } });

app.use(cors());
app.use(express.json());

/* ------------------------------- HTTP ---------------------------------- */

app.post('/api/auth/register', wrap(async (req, res) => {
  res.json(await register(prisma, req.body));
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  res.json(await login(prisma, req.body));
}));

app.use('/api', httpAuth(prisma));

app.get('/api/me', (req, res) => res.json(publicUser(req.user)));

// Bootstrap da UI: canais + membros + quem esta em qual voz.
app.get('/api/bootstrap', wrap(async (req, res) => {
  const [channels, users, voiceStates] = await Promise.all([
    prisma.channel.findMany({ orderBy: [{ type: 'asc' }, { position: 'asc' }] }),
    prisma.user.findMany({ orderBy: { displayName: 'asc' } }),
    prisma.voiceState.findMany(),
  ]);
  res.json({ channels, users: users.map(publicUser), voiceStates });
}));

app.get('/api/channels/:id/messages', wrap(async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { channelId: req.params.id },
    include: { author: true, attachments: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    ...(req.query.before ? { cursor: { id: req.query.before }, skip: 1 } : {}),
  });
  res.json(messages.reverse().map(serializeMessage));
}));

app.post('/api/channels', requirePermission('MANAGE_CHANNELS'), wrap(async (req, res) => {
  const { name, type } = req.body;
  if (!['TEXT', 'VOICE'].includes(type)) throw new HttpError(400, 'Tipo de canal invalido.');
  const count = await prisma.channel.count({ where: { type } });
  const channel = await prisma.channel.create({
    data: { name: slug(name), type, position: count },
  });
  io.emit('channel:created', channel);
  res.json(channel);
}));

app.delete('/api/channels/:id', requirePermission('MANAGE_CHANNELS'), wrap(async (req, res) => {
  await prisma.channel.delete({ where: { id: req.params.id } });
  io.emit('channel:deleted', { id: req.params.id });
  res.json({ ok: true });
}));

app.post('/api/invites', requirePermission('CREATE_INVITE'), wrap(async (req, res) => {
  const { maxUses = 1, expiresInHours = 24 } = req.body;
  const invite = await prisma.invite.create({
    data: {
      code: randomBytes(8).toString('base64url'),
      createdBy: req.user.id,
      maxUses,
      expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3600_000) : null,
    },
  });
  res.json(invite);
}));

app.patch('/api/members/:id/role', requirePermission('MANAGE_ROLES'), wrap(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new HttpError(404, 'Membro nao encontrado.');
  assertCanActOn(req.user, target);
  if (!['ADMIN', 'MEMBER'].includes(req.body.role)) {
    throw new HttpError(400, 'So e possivel definir ADMIN ou MEMBER.');
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: req.body.role },
  });
  io.emit('member:updated', publicUser(updated));
  res.json(publicUser(updated));
}));

app.delete('/api/members/:id', requirePermission('KICK_MEMBER'), wrap(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new HttpError(404, 'Membro nao encontrado.');
  assertCanActOn(req.user, target);
  await prisma.user.delete({ where: { id: target.id } });
  io.emit('member:removed', { id: target.id });
  disconnectUser(target.id);
  res.json({ ok: true });
}));

// Credenciais TURN temporarias (coturn com static-auth-secret).
// Nunca coloque a senha fixa do TURN no cliente.
app.get('/api/ice', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  // Sem coturn configurado, devolve so STUN. Serve para testar na mesma rede;
  // atras de NAT simetrico a conexao nao fecha e o TURN passa a ser obrigatorio.
  if (process.env.TURN_HOST && process.env.TURN_SECRET) {
    const ttl = 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${req.user.id}`;
    iceServers.push({
      urls: [
        `turn:${process.env.TURN_HOST}:3478?transport=udp`,
        `turn:${process.env.TURN_HOST}:3478?transport=tcp`,
      ],
      username,
      credential: hmac(username, process.env.TURN_SECRET),
    });
  }

  res.json({ iceServers });
});

/* ------------------------- Socket: tempo real -------------------------- */

io.use(socketAuth(prisma));

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  io.emit('presence:online', { userId: user.id });

  socket.on('message:send', guardSocket(socket, 'SEND_MESSAGE', async ({ channelId, content }) => {
    const text = String(content ?? '').trim().slice(0, 4000);
    if (!text) throw new Error('Mensagem vazia.');
    const message = await prisma.message.create({
      data: { channelId, content: text, authorId: user.id },
      include: { author: true, attachments: true },
    });
    io.emit('message:new', serializeMessage(message));
    return { id: message.id };
  }));

  socket.on('message:delete', guardSocket(socket, 'SEND_MESSAGE', async ({ id }) => {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) throw new Error('Mensagem nao encontrada.');
    // apagar a propria sempre pode; apagar a dos outros exige cargo
    const isOwn = message.authorId === user.id;
    if (!isOwn && !can(user, 'DELETE_ANY_MESSAGE')) throw new Error('Sem permissao.');
    await prisma.message.delete({ where: { id } });
    io.emit('message:deleted', { id, channelId: message.channelId });
  }));

  /* ---- Sala de voz: entrar, sair, e o handshake WebRTC ---- */

  socket.on('voice:join', guardSocket(socket, 'JOIN_VOICE', async ({ channelId }) => {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (channel?.type !== 'VOICE') throw new Error('Esse canal nao e de voz.');

    await prisma.voiceState.upsert({
      where: { userId: user.id },
      create: { userId: user.id, channelId },
      update: { channelId, streaming: false, cameraOn: false },
    });

    const room = `voice:${channelId}`;
    socket.data.voiceChannelId = channelId;
    socket.join(room);

    // Quem ja estava na sala. O NOVO participante inicia a oferta para
    // cada um deles — assim so um lado oferece e nao ha colisao de SDP.
    const peers = (await io.in(room).fetchSockets())
      .filter((s) => s.data.user.id !== user.id)
      .map((s) => publicUser(s.data.user));

    socket.to(room).emit('voice:peer-joined', publicUser(user));
    return { peers };
  }));

  socket.on('voice:leave', () => leaveVoice(socket));

  socket.on('voice:state', guardSocket(socket, 'JOIN_VOICE', async (patch) => {
    const allowed = pick(patch, ['muted', 'deafened', 'streaming', 'cameraOn']);
    const state = await prisma.voiceState.update({
      where: { userId: user.id },
      data: allowed,
    });
    io.to(`voice:${state.channelId}`).emit('voice:state', { userId: user.id, ...allowed });
  }));

  // Relay puro de sinalizacao. O servidor nunca ve audio nem video —
  // so troca SDP e candidatos ICE. Por isso a banda dele e irrisoria.
  for (const event of ['voice:offer', 'voice:answer', 'voice:ice']) {
    socket.on(event, ({ to, payload }) => {
      if (!socket.data.voiceChannelId) return;
      io.to(`user:${to}`).emit(event, { from: user.id, payload });
    });
  }

  socket.on('disconnect', async () => {
    await leaveVoice(socket);
    const remaining = await io.in(`user:${user.id}`).fetchSockets();
    if (remaining.length === 0) io.emit('presence:offline', { userId: user.id });
  });
});

async function leaveVoice(socket) {
  const channelId = socket.data.voiceChannelId;
  if (!channelId) return;
  socket.data.voiceChannelId = null;
  socket.leave(`voice:${channelId}`);
  await prisma.voiceState.deleteMany({ where: { userId: socket.data.user.id } });
  io.to(`voice:${channelId}`).emit('voice:peer-left', { userId: socket.data.user.id });
}

async function disconnectUser(userId) {
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  sockets.forEach((s) => s.disconnect(true));
}

/* ------------------------------ helpers -------------------------------- */

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

app.use((err, req, res, _next) => {
  const status = err.status ?? 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Erro interno.' });
});

function serializeMessage(m) {
  return {
    id: m.id,
    content: m.content,
    channelId: m.channelId,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    author: publicUser(m.author),
    attachments: m.attachments ?? [],
  };
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => k in (obj ?? {})).map((k) => [k, Boolean(obj[k])]));
}

function slug(name) {
  return String(name ?? '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 32) || 'canal';
}

function hmac(value, secret) {
  return createHmac('sha1', secret).update(value).digest('base64');
}

const PORT = process.env.PORT ?? 3001;
http.listen(PORT, () => console.log(`Sinalizacao ouvindo na porta ${PORT}`));
