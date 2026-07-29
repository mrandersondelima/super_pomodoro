# Super Pomodoro

Aplicativo desktop em Vue 3 + Vuetify + Electron para montar sequencias de cronometros que executam uma apos a outra.

## O que o app faz

- Permite cadastrar varias etapas com titulo, duracao em minutos e mensagem de alerta.
- Inicia automaticamente a proxima etapa quando a atual termina.
- Dispara notificacoes nativas do Windows ao fim de cada cronometro.

## Scripts

- `npm run dev`: abre o app desktop com Vue e Electron em modo de desenvolvimento.
- `npm run build`: gera o build web do frontend.
- `npm run dist`: empacota executaveis Windows na pasta `release`.
