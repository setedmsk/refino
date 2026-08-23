#!/usr/bin/env node
/**
 * Diz o que falta para o servidor subir, em vez de voce descobrir por
 * tentativa e erro. Nao conserta nada — so aponta, com o comando ao lado.
 *
 *   npm run checar
 */
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...x) => path.join(raiz, ...x);

let problemas = 0;
const ok = (t, extra = '') => console.log(`  ok    ${t}${extra ? '  ' + extra : ''}`);
const falta = (t, comoResolver) => {
  problemas++;
  console.log(`  FALTA ${t}`);
  console.log(`        -> ${comoResolver}`);
};

console.log('\nVerificando o que falta para subir:\n');

/* --------------------------------- node -------------------------------- */
const maior = Number(process.versions.node.split('.')[0]);
if (maior >= 20) ok('Node', `v${process.versions.node}`);
else falta(`Node v${process.versions.node} e antigo`, 'instale o Node 22: https://nodejs.org');

/* -------------------------------- .env --------------------------------- */
const envPath = p('server', '.env');
let env = {};
if (!existsSync(envPath)) {
  falta('server/.env nao existe', 'cd server && cp .env.example .env');
} else {
  env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
  ok('server/.env existe');

  if (env.JWT_SECRET) ok('JWT_SECRET preenchido');
  else falta('JWT_SECRET vazio', 'gere com: openssl rand -base64 32   (e cole no .env)');

  if (env.DATABASE_URL) ok('DATABASE_URL preenchido');
  else falta('DATABASE_URL vazio', 'aponte para o seu Postgres no .env');

  // Vazio e o certo quando o proprio Express serve o client: a origem muda
  // conforme o caminho ate o servidor, e uma lista fixa bloqueia o resto.
  if (env.CLIENT_ORIGIN) {
    console.log(`  aviso CLIENT_ORIGIN="${env.CLIENT_ORIGIN}"`);
    console.log('        -> quem chegar por outro endereco (tunel, IP da rede) perde o');
    console.log('           CORS e o socket morre sem erro na tela. Deixe vazio, a menos');
    console.log('           que o client esteja hospedado em outra origem.');
  } else ok('CLIENT_ORIGIN vazio', '(aceita qualquer origem)');

  if (!env.TURN_HOST || !env.TURN_SECRET) {
    console.log('  aviso sem coturn (TURN_HOST/TURN_SECRET vazios)');
    console.log('        -> /api/ice devolve so STUN. Funciona na mesma rede e na maioria');
    console.log('           das casas; atras de NAT dificil a chamada nao fecha.');
  } else ok('coturn configurado', env.TURN_HOST);
}

/* -------------------------------- banco -------------------------------- */
if (env.DATABASE_URL) {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    await prisma.$queryRaw`SELECT 1`;
    const migracoes = await prisma
      .$queryRaw`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`
      .catch(() => null);
    if (migracoes) ok('Postgres responde', `${migracoes[0].n} migracao(oes) aplicada(s)`);
    else falta('banco sem migracoes', 'npm run db:deploy');
    const users = await prisma.user.count().catch(() => null);
    if (users !== null) {
      ok('tabelas existem', users === 0 ? '(nenhum usuario: o primeiro cadastro vira OWNER)' : `${users} usuario(s)`);
    }
    await prisma.$disconnect();
  } catch (err) {
    falta(`Postgres nao respondeu (${String(err.message).split('\n')[0].slice(0, 60)})`,
          'suba o Postgres e confira DATABASE_URL no .env');
  }
}

/* ------------------------------- client -------------------------------- */
if (existsSync(p('client', 'dist', 'index.html'))) ok('client compilado', 'client/dist');
else falta('client nao compilado', 'npm run build:client');

/* ----------------------------- cloudflared ----------------------------- */
try {
  const v = execSync('cloudflared --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  ok('cloudflared', v.split(' ').slice(0, 3).join(' '));
} catch {
  console.log('  aviso cloudflared nao encontrado');
  console.log('        -> so precisa para testar com alguem de fora da sua rede:');
  console.log('           https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
}

/* -------------------------------- fecho -------------------------------- */
if (problemas === 0) {
  console.log('\nTudo pronto. Suba com:\n');
  console.log('  cd server && npm start');
  console.log('\nE, para alguem de fora entrar (o navegador precisa de HTTPS):\n');
  console.log('  cloudflared tunnel --url http://localhost:3001\n');
} else {
  console.log(`\n${problemas} coisa(s) para resolver antes de subir.\n`);
  process.exitCode = 1;
}
