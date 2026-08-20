// Fonte unica de verdade sobre o que cada cargo pode fazer.
// Nada no front decide permissao. O front so esconde botoes por conveniencia.

export const PERMISSIONS = {
  // qualquer membro autenticado
  SEND_MESSAGE:      ['OWNER', 'ADMIN', 'MEMBER'],
  DELETE_OWN_MESSAGE:['OWNER', 'ADMIN', 'MEMBER'],
  JOIN_VOICE:        ['OWNER', 'ADMIN', 'MEMBER'],
  SHARE_SCREEN:      ['OWNER', 'ADMIN', 'MEMBER'],
  UPLOAD_FILE:       ['OWNER', 'ADMIN', 'MEMBER'],

  // so quem administra
  MANAGE_CHANNELS:   ['OWNER', 'ADMIN'], // criar, renomear, apagar, reordenar
  DELETE_ANY_MESSAGE:['OWNER', 'ADMIN'],
  KICK_MEMBER:       ['OWNER', 'ADMIN'],
  CREATE_INVITE:     ['OWNER', 'ADMIN'],
  MOVE_VOICE_MEMBER: ['OWNER', 'ADMIN'],
  SERVER_MUTE:       ['OWNER', 'ADMIN'],

  // so o dono
  MANAGE_ROLES:      ['OWNER'], // promover/rebaixar
  MANAGE_SERVER:     ['OWNER'], // nome, icone, config geral
};

export function can(user, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Permissao desconhecida: ${permission}`);
  return Boolean(user) && allowed.includes(user.role);
}

// Regras que nao sao "permissao", sao invariantes. Valem ate pro OWNER.
export function assertCanActOn(actor, target) {
  if (target.role === 'OWNER') {
    throw new HttpError(403, 'O dono do servidor nao pode ser alterado.');
  }
  if (actor.id === target.id) {
    throw new HttpError(403, 'Voce nao pode fazer isso com voce mesmo.');
  }
  // ADMIN nao mexe em outro ADMIN. Evita guerra civil entre admins.
  if (actor.role === 'ADMIN' && target.role === 'ADMIN') {
    throw new HttpError(403, 'Admins nao podem gerenciar outros admins.');
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Middleware para rotas HTTP
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      return res.status(403).json({ error: 'Voce nao tem permissao para isso.' });
    }
    next();
  };
}

// Guard para handlers de socket. Mesma logica, superficie diferente.
// IMPORTANTE: o socket e tao exposto quanto o HTTP. Um cliente modificado
// emite qualquer evento que quiser. Todo handler passa por aqui.
export function guardSocket(socket, permission, handler) {
  return async (payload, ack) => {
    try {
      if (!can(socket.data.user, permission)) {
        return ack?.({ ok: false, error: 'Sem permissao.' });
      }
      const result = await handler(payload);
      ack?.({ ok: true, data: result });
    } catch (err) {
      ack?.({ ok: false, error: err.message ?? 'Erro interno.' });
    }
  };
}
