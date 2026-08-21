import { useState } from 'react';
import { api } from '../lib/api';
import type { Invite, Permission, Role, User } from '../types';
import { Avatar } from './Avatar';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'dono',
  ADMIN: 'admin',
  MEMBER: 'membro',
};

/**
 * Espelha o assertCanActOn do servidor. Nao e permissao, e invariante: vale
 * ate para o dono. Aqui serve so para nao oferecer um botao que o servidor
 * vai recusar — quem decide continua sendo o backend.
 */
function podeAgirSobre(me: User, alvo: User) {
  if (alvo.role === 'OWNER') return false;
  if (alvo.id === me.id) return false;
  if (me.role === 'ADMIN' && alvo.role === 'ADMIN') return false;
  return true;
}

type Props = {
  me: User;
  users: User[];
  permissions: Permission[];
  onClose: () => void;
};

export function AdminPanel({ me, users, permissions, onClose }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [maxUses, setMaxUses] = useState(1);
  const [horas, setHoras] = useState(24);
  const [copiado, setCopiado] = useState(false);

  const podeCargos = permissions.includes('MANAGE_ROLES');
  const podeExpulsar = permissions.includes('KICK_MEMBER');
  const podeConvidar = permissions.includes('CREATE_INVITE');

  async function acao(chave: string, fn: () => Promise<unknown>) {
    setErro(null);
    setOcupado(chave);
    try {
      await fn();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falhou.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-topo">
          <strong>Membros e convites</strong>
          <button className="link" onClick={onClose}>
            fechar
          </button>
        </header>

        {erro && <p className="error modal-erro">{erro}</p>}

        {podeConvidar && (
          <section className="modal-secao">
            <h3>Convite</h3>
            <div className="convite-form">
              <label>
                Usos
                <input
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                />
              </label>
              <label>
                Validade (horas)
                <input
                  type="number"
                  min={0}
                  value={horas}
                  onChange={(e) => setHoras(Number(e.target.value))}
                />
              </label>
              <button
                disabled={ocupado === 'invite'}
                onClick={() =>
                  acao('invite', async () => {
                    setCopiado(false);
                    setInvite(
                      await api.createInvite({
                        maxUses,
                        expiresInHours: horas > 0 ? horas : null,
                      })
                    );
                  })
                }
              >
                Gerar
              </button>
            </div>

            {invite && (
              <div className="convite-codigo">
                <code>{invite.code}</code>
                <button
                  className="link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invite.code);
                    setCopiado(true);
                  }}
                >
                  {copiado ? 'copiado' : 'copiar'}
                </button>
                <small>
                  {invite.maxUses} uso(s) ·{' '}
                  {invite.expiresAt
                    ? `expira ${new Date(invite.expiresAt).toLocaleString('pt-BR')}`
                    : 'sem prazo'}
                </small>
              </div>
            )}

            {/* Regra 5: quem entra por convite e sempre MEMBER. */}
            <p className="nota">Convite nunca concede cargo. Quem entra vira membro.</p>
          </section>
        )}

        <section className="modal-secao">
          <h3>Membros ({users.length})</h3>
          <ul className="membros">
            {users.map((u) => {
              const alvo = podeAgirSobre(me, u);
              return (
                <li key={u.id}>
                  <Avatar user={u} size={28} />
                  <span className="membro-nome">
                    {u.displayName}
                    <small>@{u.username}</small>
                  </span>

                  {podeCargos && alvo ? (
                    <select
                      value={u.role}
                      disabled={ocupado === u.id}
                      onChange={(e) =>
                        acao(u.id, () => api.setRole(u.id, e.target.value as Role))
                      }
                    >
                      <option value="MEMBER">membro</option>
                      <option value="ADMIN">admin</option>
                    </select>
                  ) : (
                    <span className="cargo">{ROLE_LABEL[u.role]}</span>
                  )}

                  {podeExpulsar && alvo && (
                    <button
                      className="danger"
                      disabled={ocupado === u.id}
                      onClick={() => {
                        // A cascata do schema leva junto tudo que a pessoa
                        // escreveu. Melhor avisar do que surpreender.
                        const ok = window.confirm(
                          `Expulsar ${u.displayName}?\n\n` +
                            'Todas as mensagens dessa pessoa serão apagadas junto — ' +
                            'o banco apaga em cascata. Não dá para desfazer.'
                        );
                        if (ok) acao(u.id, () => api.kickMember(u.id));
                      }}
                    >
                      Expulsar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
