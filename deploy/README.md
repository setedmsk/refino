# Deploy — Oracle Always Free

Passo a passo para uma VM limpa. Tudo aqui cabe no plano gratuito.

Arquivos desta pasta: `voz.service` (systemd), `Caddyfile` (HTTPS) e
`turnserver.conf` (coturn).

## Antes de tudo: por que TLS não é opcional

Fora de `localhost`, navegador sem HTTPS **não expõe `navigator.mediaDevices`**.
Não é aviso no console — o objeto não existe. Medido:

| origem | `isSecureContext` | `navigator.mediaDevices` |
|---|---|---|
| `http://localhost:5173` | true | existe |
| `http://192.0.2.2:5173` | false | **undefined** |

`RTCPeerConnection` continua existindo, então a sinalização funciona e você
entra numa chamada muda sem entender por quê. O app Electron escapa disso
porque `file://` já é contexto seguro.

## 1. A instância

Ampere A1 (ARM), Ubuntu 24.04, o shape gratuito. Guarde o **IP público**.

## 2. Firewall — as duas paredes

A Oracle tem firewall no painel **e** regras locais no `iptables` que ignoram
o painel. Abrir só um lado é o erro mais comum, e o sintoma é chamada que
conecta entre dois PCs na mesma casa e falha entre casas diferentes.

No painel (Security List → Ingress):

| Porta | Protocolo | Para quê |
|---|---|---|
| 80, 443 | TCP | Caddy (o 80 é obrigatório para o Let's Encrypt) |
| 3478 | TCP e UDP | coturn |
| 49152–65535 | UDP | relay do coturn |

E no Ubuntu:

```bash
sudo iptables -I INPUT -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 49152:65535 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Domínio grátis

Registre em [duckdns.org](https://www.duckdns.org) e aponte para o IP público.
O Caddy precisa do nome para emitir o certificado — IP não serve.

## 4. Pacotes

```bash
sudo apt update
sudo apt install -y postgresql coturn caddy git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 5. Banco

```bash
sudo -u postgres psql -c "CREATE ROLE voz LOGIN PASSWORD 'ponha-uma-senha-aqui';"
sudo -u postgres psql -c "CREATE DATABASE voz OWNER voz;"
```

## 6. O código

```bash
# Sem -m: o git clone recusa diretorio que ja existe e nao esta vazio.
sudo useradd -r -s /usr/sbin/nologin -d /opt/voz voz
sudo git clone https://github.com/setedmsk/refino /opt/voz
sudo chown -R voz:voz /opt/voz

# -H para o npm ter HOME gravavel; sem isso ele tenta escrever no seu.
cd /opt/voz
sudo -u voz -H npm install
sudo -u voz -H npm run build:client    # o Express serve client/dist
```

## 7. Os segredos

```bash
cd /opt/voz/server
sudo -u voz -H cp .env.example .env
openssl rand -base64 32   # JWT_SECRET
openssl rand -hex 32      # TURN_SECRET
sudo -u voz -H nano .env
sudo chmod 600 .env
```

Preencha:

```
DATABASE_URL="postgresql://voz:a-senha-do-passo-5@localhost:5432/voz?schema=public"
JWT_SECRET="<o primeiro openssl>"
TURN_HOST="seu-host.duckdns.org"
TURN_SECRET="<o segundo openssl>"
CLIENT_ORIGIN="https://seu-host.duckdns.org"
PORT=3001
```

**O `TURN_SECRET` precisa ser idêntico ao `static-auth-secret` do coturn.**
Se divergirem, o TURN recusa e você só descobre no dia em que alguém entrar
de uma rede com NAT difícil — todo o resto continua funcionando.

Aplique o schema:

```bash
sudo -u voz -H npm run db:deploy
```

`db:deploy` roda as migracoes versionadas de `prisma/migrations`. Nao use
`db:push` num banco com dados: ele compara o schema com o banco e pode
propor descartar coluna para "sincronizar".

## 8. Serviço

```bash
sudo cp /opt/voz/deploy/voz.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voz
journalctl -u voz -f
```

## 9. coturn

```bash
sudo cp /opt/voz/deploy/turnserver.conf /etc/turnserver.conf
sudo nano /etc/turnserver.conf   # static-auth-secret, realm, external-ip
sudo systemctl enable --now coturn
```

`external-ip` precisa ser o **IP público**: na Oracle a placa de rede só
enxerga o IP privado, então sem essa linha o coturn anuncia um endereço que
ninguém alcança.

## 10. Caddy

```bash
sudo cp /opt/voz/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile    # troque o domínio
sudo systemctl reload caddy
```

O certificado sai sozinho no primeiro acesso.

## 11. Sua conta

Abra `https://seu-host.duckdns.org` e **cadastre-se antes de qualquer
pessoa** — o primeiro cadastro vira OWNER sem convite. Depois disso ninguém
entra sem código.

No app desktop, o campo **Servidor** recebe `https://seu-host.duckdns.org`,
sem porta: quem responde na 443 é o Caddy.

## Conferir que o TURN está de pé

```bash
# no servidor, com o token de alguém logado:
curl -s https://seu-host.duckdns.org/api/ice -H "Authorization: Bearer SEU_TOKEN"
```

Tem que vir um `turn:` com `username` no formato `<timestamp>:<id>` e uma
`credential`. Para provar que o segredo bate, recalcule — é exatamente o que
o coturn faz para conferir:

```bash
python3 -c '
import hmac, hashlib, base64, sys
usuario, segredo = sys.argv[1], sys.argv[2]
print(base64.b64encode(hmac.new(segredo.encode(), usuario.encode(), hashlib.sha1).digest()).decode())
' "<o username devolvido>" "<TURN_SECRET>"
```

O resultado tem que ser igual à `credential`. Diferente significa segredo
trocado entre o `.env` e o `/etc/turnserver.conf`.

## Atualizar

```bash
cd /opt/voz
sudo -u voz -H git pull
sudo -u voz -H npm install
sudo -u voz -H npm run build:client
sudo -u voz -H npm run db:deploy
sudo systemctl restart voz
```
