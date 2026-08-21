import { useEffect, useState } from 'react';
import type { DesktopSource } from '../lib/config';

/**
 * Seletor proprio de tela/janela, com miniatura. So existe no Electron: no
 * navegador quem mostra a lista e o proprio Chrome, e nao da para substituir.
 */
export function SourcePicker({
  onPick,
  onClose,
}: {
  onPick: (sourceId: string) => void;
  onClose: () => void;
}) {
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    window.desktop
      ?.listSources()
      .then(setSources)
      .catch((err: unknown) =>
        setErro(err instanceof Error ? err.message : 'Não deu para listar.')
      );
  }, []);

  const telas = sources?.filter((s) => s.kind === 'screen') ?? [];
  const janelas = sources?.filter((s) => s.kind === 'window') ?? [];

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <header className="modal-topo">
          <strong>Compartilhar</strong>
          <button className="link" onClick={onClose}>
            cancelar
          </button>
        </header>

        {erro && <p className="error modal-erro">{erro}</p>}
        {!sources && !erro && <p className="empty">procurando telas e janelas…</p>}

        {[
          ['Telas', telas],
          ['Janelas', janelas],
        ].map(([titulo, lista]) => {
          const itens = lista as DesktopSource[];
          if (itens.length === 0) return null;
          return (
            <section className="modal-secao" key={titulo as string}>
              <h3>{titulo as string}</h3>
              <div className="fontes">
                {itens.map((s) => (
                  <button key={s.id} className="fonte" onClick={() => onPick(s.id)}>
                    <img src={s.thumbnail} alt="" />
                    <span className="fonte-nome">
                      {s.icon && <img className="fonte-icone" src={s.icon} alt="" />}
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
