/**
 * A janela do Electron sobe com frame: false. Sem esta barra nao ha como
 * arrastar, minimizar nem fechar o app — a area com -webkit-app-region: drag
 * e o que substitui a moldura do sistema.
 */
export function TitleBar() {
  const desktop = window.desktop;
  if (!desktop) return null;

  return (
    <div className="titlebar">
      <span className="titlebar-nome">Voz</span>
      <div className="titlebar-botoes">
        <button onClick={() => desktop.minimize()} title="Minimizar">
          ─
        </button>
        <button onClick={() => desktop.maximize()} title="Maximizar">
          ▢
        </button>
        <button className="fechar" onClick={() => desktop.close()} title="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
