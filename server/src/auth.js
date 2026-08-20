import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from './permissions.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Defina JWT_SECRET no .env');

const TOKEN_TTL_DAYS = 30;

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    SECRET,
    { expiresIn: `${TOKEN_TTL_DAYS}d` }
  );
}

// Le o token e busca o usuario FRESCO no banco.
// Nao confie no role que veio dentro do token: se voce rebaixar alguem,
// o token antigo dele ainda diria ADMIN ate expirar.
export async function resolveUser(prisma, token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    return await prisma.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
}

export function httpAuth(prisma) {
  return async (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = await resolveUser(prisma, token);
    if (!user) return res.status(401).json({ error: 'Nao autenticado.' });
    req.user = user;
    next();
  };
}

export function socketAuth(prisma) {
  return async (socket, next) => {
    const user = await resolveUser(prisma, socket.handshake.auth?.token);
    if (!user) return next(new Error('Nao autenticado.'));
    socket.data.user = user;
    next();
  };
}

export async function register(prisma, { username, displayName, password, inviteCode }) {
  if (!username || !password) throw new HttpError(400, 'Usuario e senha sao obrigatorios.');
  if (password.length < 8) throw new HttpError(400, 'A senha precisa de ao menos 8 caracteres.');

  const userCount = await prisma.user.count();

  // O primeiro cadastro do servidor vira OWNER, sem convite. Depois disso,
  // convite e obrigatorio: ninguem entra pela porta da frente.
  const isFirstUser = userCount === 0;
  let invite = null;

  if (!isFirstUser) {
    invite = await prisma.invite.findUnique({ where: { code: inviteCode ?? '' } });
    if (!invite || invite.revokedAt) throw new HttpError(400, 'Convite invalido.');
    if (invite.expiresAt && invite.expiresAt < new Date()) throw new HttpError(400, 'Convite expirado.');
    if (invite.uses >= invite.maxUses) throw new HttpError(400, 'Convite ja foi usado.');
  }

  const taken = await prisma.user.findUnique({ where: { username } });
  if (taken) throw new HttpError(409, 'Esse nome de usuario ja existe.');

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        displayName: displayName || username,
        passwordHash: await bcrypt.hash(password, 12),
        role: isFirstUser ? 'OWNER' : 'MEMBER', // convite NUNCA concede cargo
        avatarColor: randomAvatarColor(),
      },
    });
    if (invite) {
      await tx.invite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });
    }
    return created;
  });

  return { user: publicUser(user), token: signToken(user) };
}

export async function login(prisma, { username, password }) {
  const user = await prisma.user.findUnique({ where: { username } });
  // Compara mesmo sem usuario, pra o tempo de resposta nao revelar
  // quais nomes existem no servidor.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new HttpError(401, 'Usuario ou senha incorretos.');
  return { user: publicUser(user), token: signToken(user) };
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    role: user.role,
  };
}

function randomAvatarColor() {
  const palette = ['#7c5cff', '#e6399b', '#00b884', '#f0a020', '#3b82f6', '#ef4444'];
  return palette[Math.floor(Math.random() * palette.length)];
}
