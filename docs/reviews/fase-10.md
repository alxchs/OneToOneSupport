# Auditoria do chefe — Fase 10: Empacotamento e Aceite da V1.0

**Veredito: APROVADA COM CORREÇÕES DO CHEFE**: correções aplicadas em `68ab390`. Pendente para fechar o critério
"CI executado de verdade": push autorizado pelo Alexandre e execução real no GitHub Actions (ver §4).

Data: 2026-10-02. Branch `fase/10-empacotamento-aceite`. Commits auditados: `a13e598`..`59470ae` (fase + correção do
quadro de 01/10) e as correções do chefe em `68ab390`.

## 1. Auditor automático
1ª passada: 3 reprovações. Depois das correções, `node tools/auditar.cjs` ficou TUDO VERDE: clone limpo, `npm ci`,
`npm run verify` com 411 testes, sonda 46/46, 360 afirmações conferidas e 0 falhas de sinal de risco.
Restam 3 avisos `TIPO_SUPRIMIDO` (`GuestRoom.tsx:103`, `engine.ts:583-584`) em código de tratamento de mensagens
já existente, sem borda nova.

## 2. Defeitos achados pelo chefe (não estavam na autoauditoria)
1. **Firewall não era criado na instalação padrão (T2, falso PASS).** `electron-builder.yml` não definia
   `perMachine`, e o padrão (`perMachine=false`) instala para o usuário atual sem elevação. Medido: instalação
   silenciosa `/S /currentuser` terminou com código 0 e `netsh advfirewall firewall show rule name="OneToOneSupport"`
   respondeu `No rules match the specified criteria.` O `nsExec::Exec` descartava a falha do `netsh`. A
   evidência da autoauditoria era de uma regra criada à mão, com elevação, e a remoção mostrada era um `netsh
   delete` manual, não o desinstalador. **Corrigido:** `nsis.perMachine: true` e `ExecToLog` + `Pop $0` com aviso ao
   usuário. **Provado após a correção**, com instalação elevada real (UAC aprovado pelo Alexandre):
   ```
   Rule Name:  OneToOneSupport
   Enabled:    Yes
   Direction:  In
   Profiles:   Private
   Program:    C:\Users\alxch\AppData\Local\Temp\onetoone-audit10pm\OneToOneSupport.exe
   Action:     Allow
   ```
   Desinstalação elevada: `uninstall exit: 0`, pasta removida, `No rules match the specified criteria.`
   Os dados ficam em `%APPDATA%\OneToOneSupport` (`getDefaultDbPath`, `getDefaultArquivoRootDir`), então instalar
   em Program Files não quebra escrita.
2. **Entregas T6/T7 apagadas por engano depois do commit da fase.** O `79d679b` ("sincroniza documentação")
   gravou por cima uma cópia antiga: `docs/ARQUITETURA.md` ficou com 0 linhas, a seção da Fase 10 saiu do
   HANDOFF e os comentários `risco-aceito` saíram de `tools/medir-latencia.cjs`. **Restaurados** a partir do `d88070a`.
   `verificar-afirmacoes.cjs` confere o ARQUITETURA restaurado (360 afirmações, 0 inexistentes).
3. **`npm run package` empacotava o `dist/` que estivesse no disco**, sem compilar. O `release/` encontrado
   era de 29/09, anterior à correção do quadro. **Corrigido:** `"package": "npm run build && electron-builder --win"`.
4. **README afirmava "testado e homologado" em Chrome/Brave/Edge/Safari mobile (T9).** Só existe emulação do
   Chrome via CDP. Faltava ainda a limitação de mais de 100 abas, pedida na ordem. **Corrigido** no README.
5. Menores: autoauditoria duplicada (`-10-empacotamento-aceite.md` idêntica a `-10.md`), removida; `as any`
   desnecessário no cache de `TAB_STATE` do Guest, tipado com `CachedTabStateMsg`; `--no-sandbox` do Chrome de
   teste marcado como `risco-aceito`.

## 3. O que o chefe verificou de verdade
- `npm run build && npm run package`, que gerou NSIS (`perMachine=true`) e portable.
- Instalação numa pasta limpa e sonda contra o `.exe` **instalado** (`ONETOONE_EXE=...`): 46/46 PASS, com
  SQLite, E2EE, LAN, quadro, abas e relatório PDF rodando de dentro do asar. Captura da tela: abre com o build
  `59470ae`. Um `404` no console durante V5 não afetou nenhuma checagem.
- `tools/test-touch-and-drawing-fix.cjs` (correção de 01/10) depois das minhas mudanças no Guest: os 5 critérios ✓.
- `npm audit --omit=dev`: restam `fabric` (high, XSS na exportação SVG; não há `toSVG` em `src/`/`electron/`) e
  `tar` (critical, ferramenta de build). `@electron/asar listPackage` mostra 0 de 3995 entradas de
  `tar`/`@mapbox`/`puppeteer` no `app.asar`, então a justificativa se sustenta.
- Latência: `medir-latencia.cjs` usa o IP da LAN (`ws://${lanIp}`) e recusa `127.0.0.1`. Ressalva: Host e Guest
  estão na mesma máquina, então o tempo de rádio do Wi-Fi não entra. O p95 de 2,44 ms deixa margem de cerca de 80x
  sobre o limite de 200 ms, e a ressalva não muda o veredito.
- Ícone: paleta azul-ardósia aprovada pelo Alexandre em 2026-09-26 (registrado na ordem), sem vermelho.

## 4. Não verificado / pendente
- **CI no GitHub Actions:** `.github/workflows/ci.yml` existe (Node 20, `windows-latest`, gatilho em `main` e
  `fase/**`), mas **nunca rodou**. Depende do `git push` autorizado. Depois do push, o chefe acompanha com
  `gh run list` e só então fecha o critério.
- Desenho por toque em celular físico depois da correção de 01/10: só emulação CDP, com eventos sintéticos e sem
  `SendInput`/aparelho real.
- Fluxo interativo do instalador (tela "para todos / só para mim") não foi clicado. Com `perMachine: true`, a tela
  de escolha não aparece, e o teste foi com `/S`.
