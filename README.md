# Batalha Naval Web

Jogo multiplayer de Batalha Naval acessado pelo browser. Dois jogadores entram em uma sala por codigo, posicionam suas frotas e jogam por turnos ate que todos os navios de um jogador sejam afundados.

Autor e desenvolvedor: Miguel Azarias Cellani.

## Tecnologias

- Frontend: React, TypeScript e Vite.
- Backend: Node.js, TypeScript, Fastify e Socket.IO.
- Regras compartilhadas: pacote `@batalha-naval/shared`.
- Testes: Vitest e Playwright.

## Como Rodar

Instale as dependencias:

```bash
npm install
```

Inicie frontend e backend:

```bash
npm run dev
```

Acesse no browser:

```text
http://localhost:5173/
```

Para acessar de outra maquina na mesma rede, use o IP local da maquina que esta rodando o projeto:

```text
http://SEU_IP_LOCAL:5173/
```

O backend roda na porta `3333`.

## Como Jogar

1. Abra o jogo em duas janelas ou em dois dispositivos na mesma rede.
2. Em uma janela, clique em `Criar sala`.
3. Na outra janela, informe o codigo da sala e clique em `Entrar`.
4. Posicione os navios manualmente ou use `Auto`.
5. Clique em `Confirmar frota`.
6. Ataque o tabuleiro inimigo no seu turno.

## Scripts

```bash
npm run dev
npm test
npm run test:e2e
npm run typecheck
npm run build
```

## Estrutura

```text
apps/web        Frontend React
apps/server     Backend Fastify + Socket.IO
packages/shared Regras, tipos e validacoes compartilhadas
e2e             Testes de ponta a ponta
```

## Observacoes

- As salas ficam em memoria no backend.
- Reiniciar o servidor apaga as partidas ativas.
- Nao ha login, banco de dados ou camada de seguranca nesta versao.
