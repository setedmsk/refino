# Contexto do projeto

Servidor de voz único (single-tenant) com canais de texto, canais de voz e
compartilhamento de tela em alta qualidade. Inspirado no Discord, mas com
**um servidor só** — não existe lista de servidores, convite público nem
multi-tenancy.

Uso pessoal, grupo pequeno de amigos. Não é produto, não será vendido.

## Restrições que não mudam

- **Custo zero.** Nada de serviço pago. Oracle Always Free + coturn próprio.
- **Mídia em P2P.** Áudio e vídeo vão direto entre os clientes. O servidor
  só faz sinalização. Nunca proponha rotear mídia pelo servidor sem eu pedir.
- **Sem SFU por enquanto.** A malha P2P atende até ~6 pessoas. Só migre para
  LiveKit/mediasoup quando eu disser que chegou a hora.
- Desktop via Electron. O alvo principal é Windows.

## Stack

Node + Express + Socket.IO · Prisma + Postgres · React + Vite + TypeScript ·
Electron · coturn

## O que já existe

```
prisma/schema.prisma          modelo de dados (sem tabela de servidor)
server/src/permissions.js     cargos — fonte única de verdade
server/src/auth.js            login, cadastro por convite, JWT
server/src/index.js           rotas HTTP + sinalização WebRTC
client/src/lib/media.js       captura de tela e ajuste de bitrate
client/src/hooks/useVoiceRoom.js  malha P2P
electron/main.js              desktopCapturer
```

Esses arquivos são o esqueleto e ainda não foram executados. Espere
encontrar erros ao rodar pela primeira vez — corrija em vez de reescrever
do zero, a arquitetura foi pensada.

## Regras técnicas inegociáveis

1. **Permissão se valida no backend, sempre.** Esconder botão no front não é
   segurança. Toda rota HTTP e todo handler de socket passa por
   `permissions.js`. Se você criar uma ação nova, ela entra no mapa de
   permissões — não invente checagem solta no meio do handler.

2. **Não remova `degradationPreference` nem `maxBitrate` do
   `tuneVideoSender`.** Sem eles o Chromium derruba a resolução da tela e não
   recupera. É o motivo de existir esse arquivo. Se um erro de tipo apontar
   pra lá, conserte o tipo, não apague a linha.

3. **`backgroundThrottling: false` no Electron fica.** Sem isso a chamada
   degrada quando a janela perde o foco.

4. **Cancelamento de eco:** ligado no microfone, desligado no áudio da tela.
   Inverter isso destrói a qualidade do som do que está sendo compartilhado.

5. O primeiro usuário cadastrado vira OWNER. Convite nunca concede cargo —
   quem entra por convite é sempre MEMBER.

## Como quero trabalhar

- Uma etapa por vez. Não pule pra frente nem implemente o que não pedi.
- Antes de mexer em mais de três arquivos, me mostre o plano.
- Rode o que der pra rodar. Se um erro aparecer, leia e corrija sozinho —
  não me traga o stack trace pedindo o que fazer.
- Sem mock, sem placeholder, sem `// TODO: implementar depois`. Se não der
  pra fazer de verdade agora, me fale.
- Commit ao final de cada etapa concluída, mensagem curta em português.

## Pergunte antes de

- Instalar dependência que não está na stack acima
- Trocar arquitetura (P2P → SFU, Prisma → outro ORM, Electron → Tauri)
- Apagar ou reescrever inteiro um dos arquivos já existentes
- Qualquer coisa que envolva credencial, `.env` ou deploy

## Etapas

**1 — Rodar.** Postgres local, `db:push`, servidor de pé, cadastro e login
funcionando via curl. Concluída quando eu consigo criar minha conta OWNER e
receber um token.

**2 — Texto.** Interface mínima: lista de canais, mensagens em tempo real
entre duas abas do navegador. Feio pode, quebrado não.

**3 — Voz.** Duas abas entram no mesmo canal de voz e se ouvem. Anel verde
no avatar de quem fala. **Esta é a etapa que importa** — não avance sem ela
sólida.

**4 — Tela.** Compartilhar tela com os presets de qualidade. Mostrar bitrate
e `qualityLimitationReason` num canto da tela pra eu conseguir diagnosticar.

**5 — Cargos na interface.** Painel de admin, gerar convite, promover,
expulsar. O backend já tem tudo; falta a tela.

**6 — Electron.** Empacotar, seletor de janela com miniatura, áudio do
sistema no Windows.

**7 — Deploy.** Só depois que tudo funcionar local.

A interface definitiva vem depois. Nas etapas 2 a 5 quero funcional e limpo,
sem investir tempo em visual — o design vou definir junto com você mais pra
frente.
