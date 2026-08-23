# Núcleo — servidor de voz P2P

Esqueleto de um servidor único (single-tenant) com canais de texto, canais de
voz e compartilhamento de tela em alta qualidade via WebRTC ponto a ponto.

O que está aqui é o **motor**: a parte chata que costuma travar projetos assim.
A camada visual é sua.

## Arquivos

| Arquivo | O que resolve |
|---|---|
| `prisma/schema.prisma` | Banco. Sem tabela de "servidor" — existe um só |
| `server/src/permissions.js` | Cargos. Fonte única de verdade, testada |
| `server/src/auth.js` | Login, cadastro por convite, JWT |
| `server/src/index.js` | Rotas + sinalização WebRTC via Socket.IO |
| `client/src/lib/media.js` | Captura e ajuste de bitrate — **o coração** |
| `client/src/hooks/useVoiceRoom.js` | Malha P2P, entrar/sair, trocar tela ao vivo |
| `electron/main.js` | `desktopCapturer` e captura de áudio do sistema |

## Rodar local

Precisa de um Postgres rodando. Com o banco local:

```bash
sudo -u postgres psql -c "CREATE ROLE voz LOGIN PASSWORD 'voz';" \
                      -c "CREATE DATABASE voz OWNER voz;"
```

```bash
cd server
cp .env.example .env          # e edite
openssl rand -base64 32       # cole em JWT_SECRET

npm install                   # npm workspace: instala a partir da raiz
npm run db:deploy          # aplica as migracoes de prisma/migrations
npm run dev
```

O `.env` fica em `server/`, que e de onde o servidor e o Prisma CLI rodam.

O **primeiro cadastro vira OWNER automaticamente e sem convite**. Faça o seu
antes de qualquer outra pessoa. Depois disso ninguém entra sem código.

## Testar com um amigo em outra máquina

O obstáculo não é o código, é o **contexto seguro**: fora de `localhost`,
navegador sem HTTPS não expõe `navigator.mediaDevices`. Não é aviso — o
objeto não existe, e você entra numa chamada muda sem entender por quê.

| origem | `isSecureContext` | `navigator.mediaDevices` |
|---|---|---|
| `http://localhost:5173` | true | existe |
| `http://192.168.0.10:3001` | false | **undefined** |
| Electron (`file://`) | true | existe |

Antes de tudo, veja o que falta na sua máquina:

```bash
npm run checar
```

Ele confere Node, `.env`, Postgres, migrações, client compilado e cloudflared,
e imprime o comando de conserto ao lado de cada pendência.

O caminho mais rápido é um túnel HTTPS. Sem conta, sem custo, sem deploy:

```bash
# 1. na SUA máquina, o servidor de pé servindo o client
npm install
npm run db:deploy
npm run build:client
cd server && npm start            # :3001

# 2. em outro terminal, o túnel
cloudflared tunnel --url http://localhost:3001
#    -> https://algo-aleatorio.trycloudflare.com
```

Depois:

1. Você abre a URL do túnel e **se cadastra primeiro** — o primeiro vira OWNER
2. Painel **Membros e convites** → *Gerar* → manda o código pro seu amigo
3. Ele abre a mesma URL, clica em *Tenho um convite* e se cadastra
4. Os dois clicam no canal de voz

Deixe `CLIENT_ORIGIN` **vazio** no `.env`. Preenchido com um endereço fixo, o
navegador do seu amigo perde o cabeçalho CORS e o socket morre — o app abre e
não faz nada, sem mensagem de erro.

**Se o texto funcionar e a voz não**, é NAT: sem coturn o `/api/ice` só
devolve STUN, o que resolve a maioria dos casos mas não todos. Aí o caminho é
o [deploy](deploy/README.md) com coturn.

## Desktop (Electron)

```bash
npm install                  # na raiz: instala server, client e electron

# dev — o Vite servindo e o Electron apontando pra ele
npm run dev:client
VITE_DEV_SERVER_URL=http://localhost:5173 npm run dev:electron

# empacotar
npm run pack                 # pasta com o executável, sem instalador
npm run dist:win             # instalador NSIS + portátil (rode no Windows)
```

O app desktop pede o **endereço do servidor** na tela de login e guarda
localmente — ele carrega de `file://`, então não existe origem para onde
mandar `/api` sozinho.

`npm run dist:win` só gera o `.exe` rodando **no Windows** (ou em Linux com
wine instalado). O `npm run pack` funciona em qualquer plataforma e serve
para conferir que o empacotamento está de pé.

## Colocar no ar de graça

Passo a passo completo em **[deploy/README.md](deploy/README.md)**, com os
arquivos prontos (`voz.service`, `Caddyfile`, `turnserver.conf`).

O resumo:

1. VM Always Free na Oracle (região com capacidade ARM disponível)
2. Postgres na mesma VM, ou Neon/Supabase se preferir não administrar
3. `coturn` na mesma VM — abra **3478 UDP e TCP** e o range **49152-65535 UDP**
   no firewall da Oracle *e* no `iptables` do Ubuntu (a Oracle vem com regras
   locais que ignoram o painel; isso engana muita gente)
4. No `turnserver.conf`, use `use-auth-secret` com o mesmo valor de `TURN_SECRET`
5. HTTPS via Caddy. **Não é opcional**: fora de `localhost`, navegador sem TLS
   não expõe `navigator.mediaDevices` — sem microfone e sem tela

## Onde a coisa vai doer

- **Áudio do sistema no macOS.** A Apple bloqueia. Exige ScreenCaptureKit ou
  driver virtual. Se macOS não for alvo, ignore e siga.
- **Acima de ~6 pessoas numa sala**, o upload de quem compartilha tela satura.
  A troca para SFU (LiveKit ou mediasoup) mexe só no `useVoiceRoom.js`.
- **Eco na chamada.** Cancelamento vem ligado no mic e desligado no áudio da
  tela, de propósito. Inverter isso arruína a música do que você compartilha.

## Próximos passos

1. Subir e conseguir uma chamada de voz entre dois PCs — só isso
2. Tela compartilhada e ajuste dos presets com o `qualityLimitationReason`
3. Interface no seu estilo
4. Upload de arquivo, notificações, atalhos de push-to-talk
