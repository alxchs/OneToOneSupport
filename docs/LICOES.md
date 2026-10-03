# Catálogo de Lições da AGY

Um catálogo dos erros cometidos (pela IA executora ou pela gerência) em fases anteriores e como detectá-los. Toda afirmação técnica aqui é acompanhada da sua **fonte primária**.

## Índice
- [Prova e evidência](#prova-e-evidencia)
  - [L-01: Falso PASS por substituição de prova prometida (pixel vs propriedade)](#l-01---falso-pass-por-substituicao-de-prova-prometida)
  - [L-02: Omissão de falha por variável calculada e não usada](#l-02---omissao-de-falha-por-variavel-calculada-e-nao-usada)
- [UI, canvas e visual](#ui-canvas-e-visual)
  - [L-03: Bug visual provado lendo apenas o canvas de baixo (DOM ignorado)](#l-03---bug-visual-provado-lendo-apenas-o-canvas-de-baixo)
  - [L-04: Testes de interação com falha ao não usar SO real](#l-04---testes-de-interacao-com-falha-ao-nao-usar-so-real)
  - [L-05: Falha de testes de escala usando apenas 1x1 e alvo injetado](#l-05---falha-de-testes-de-escala-usando-apenas-1x1-e-alvo-injetado)
- [Rede, Guest e celular](#rede-guest-e-celular)
  - [L-06: Bypass de permissão confiando na denylist do cliente](#l-06---bypass-de-permissao-confiando-na-denylist-do-cliente)
- [Segurança](#seguranca)
  - [L-07: Segurança só se prova no artefato final](#l-07---seguranca-so-se-prova-no-artefato-final)
- [Processo e ferramentas](#processo-e-ferramentas)
  - [L-08: Diagnóstico inútil por ficar invisível ao usuário](#l-08---diagnostico-inutil-por-ficar-invisivel-ao-usuario)
  - [L-09: Perda de documentação por descuido do chefe ao sincronizar](#l-09---perda-de-documentacao-por-descuido-do-chefe-ao-sincronizar)
- [Como escrever uma ordem](#como-escrever-uma-ordem)
  - [L-10: Invenção de escopo e eventos inexistentes em relatórios](#l-10---invencao-de-escopo-e-eventos-inexistentes-em-relatorios)

## Prova e evidência

### L-01 — Falso PASS por substituição de prova prometida
- Origem: `AGENTS.md`, seção "Prova prometida = prova entregue, não uma mais fraca"
- O que aconteceu: Na Fase 07, o executor prometeu prova de pixel/visual, mas substituiu por uma checagem rasa de propriedade de objeto e marcou o teste como PASS.
- Por que passou: A automação só validava a intenção estrutural, não renderizava a tela fisicamente.
- Regra: Nunca troque o método de prova pedido por um mais barato/abstrato sem avisar explicitamente.
- Como atacar: Como esse teste checa imagens se o CSS esconde os objetos do DOM (ex: `display: none`)? O teste continuaria passando em uma tela oculta?
- Checagem por máquina: sim (`tools/checar-provas.cjs`).

### L-02 — Omissão de falha por variável calculada e não usada
- Origem: `docs/reviews/fase-01.md` e seção "Lições específicas do projeto" no `AGENTS.md`
- O que aconteceu: Uma função calculou `info.changes` em um retorno, não o utilizou para checar validade, e o sistema retornou sucesso falsamente.
- Por que passou: Não houve conferência do efeito colateral final (como um get no banco).
- Regra: Sempre faça a verificação do efeito real no destino de armazenamento ou visualização após uma operação de modificação.
- Como atacar: Ao realizar uma modificação em um teste, inclua uma leitura no banco ou no componente final para garantir que o resultado esperado foi de fato persistido e não apenas calculado?
- Checagem por máquina: não (lógica de negócios).

## UI, canvas e visual

### L-03 — Bug visual provado lendo apenas o canvas de baixo
- Origem: `docs/reviews/postmortem-desenho-some.md`, fechamento 2026-09-24 (citado também no `AGENTS.md`)
- O que aconteceu: Foram gastas ~10 rodadas sem achar o defeito ("o desenho some ao soltar o mouse") porque uma camada opaca (`.upper-canvas`) encobria o desenho.
- Por que passou: Toda a prova lia apenas o buffer do canvas inferior via `getImageData` ou `toDataURL` ignorando o DOM renderizado pelo navegador.
- Regra: Bug visual só se prova com captura de tela real (`page.screenshot`) e inspeção de `getComputedStyle` de todas as camadas, nunca lendo buffer interno da biblioteca.
- Como atacar: Se for injetada uma DIV preta flutuante por cima da tela, os testes atuais perceberiam o sumiço dos desenhos?
- Checagem por máquina: sim (Puppeteer captura de tela na Sonda manual).

### L-04 — Testes de interação com falha ao não usar SO real
- Origem: `AGENTS.md`, lição da "Fase 07 (Homologação 2, 2026-09-21/22)"
- O que aconteceu: Um teste CDP sintético (`dispatchEvent`, `page.mouse`) gerou falso PASS simulando o toque perfeitamente sem esbarrar nas limitações do hardware/sistema real.
- Por que passou: Os eventos puros ignoram todo o pipeline de latência e sequenciamento de toques nativos do Windows.
- Regra: Teste interativo crítico precisa incluir ao menos uma passada por injeção do sistema operacional (`SendInput` no Windows).
- Como atacar: A prova automatizada roda sob `SendInput` real do PowerShell ou limita-se à bolha CDP?
- Checagem por máquina: sim (`SendInput` em `Issues/20260921-004718/evidencia/drag-sendinput.ps1`).

### L-05 — Falha de testes de escala usando apenas 1x1 e alvo injetado
- Origem: `docs/reviews/fase-11.md`, "Rodada 1 (2026-10-02): REJEITADA"
- O que aconteceu: A borracha apagava coordenadas fora de lugar em dispositivos pequenos, e lançava TypeError ao buscar elemento num fundo vazio.
- Por que passou: Os testes montavam a engine em escala unificada (1:1) com injeção estrita de alvo via script (`target: rectObj`), ignorando as escalas multiplicadoras de busca nativa (Host 1,5, Guest 0,34).
- Regra: Ao testar canvas e interatividade, teste em escalas múltiplas (ex: 1,5 e 0,34) buscando elementos ativamente.
- Como atacar: Se diminuir as resoluções da janela de teste para `412x915` (Mobile DPR elevado), os cliques em mouse ainda batem na área correta?
- Checagem por máquina: sim (escala emulada em UI tests).

## Rede, Guest e celular

### L-06 — Bypass de permissão confiando na denylist do cliente
- Origem: `docs/reviews/redteam-07.md` e `docs/reviews/homologacao-1.md`
- O que aconteceu: Convidado burlou o lock do host acionando `UNDO` com tela bloqueada e pôde forjar eventos customizados com strings na denylist vazada, ou tipos arbitrários.
- Por que passou: A verificação de `canGuestExecute` só checava exclusões (denylist) e assumia o controle via cliente.
- Regra: Jamais baseie acessos negados num cliente local manipulável; o bloqueio sempre acontece na borda com uma *allowlist* explícita do lado do host.
- Como atacar: Qual é a resposta do host se o convidado mandar uma string arbitrária ou enviar uma ação não proibida textualmente, mas de privilégio lógico host-side?
- Checagem por máquina: sim (Ataques RedTeam e automações de erro).

## Segurança

### L-07 — Segurança só se prova no artefato final
- Origem: `docs/reviews/fase-01.md`, citado no `AGENTS.md` ("a CSP por header... não vale em file://")
- O que aconteceu: App final de produção em Electron desabilitou CSP pois regras rodavam apenas no Node durante desenvolvimento, via `typeof require`.
- Por que passou: Ninguém executou nem validou o script no cenário final de `app.asar`.
- Regra: Verificações de segurança críticas devem passar sob uso de executável/arquivamento final.
- Como atacar: Testes falhariam se executados a partir de binário recém exportado do diretório de lib?
- Checagem por máquina: sim (`npm run package` e comandos na sonda com o `.exe`).

## Processo e ferramentas

### L-08 — Diagnóstico inútil por ficar invisível ao usuário
- Origem: `AGENTS.md`, Fase 07 Homologação 2
- O que aconteceu: O dono relatou "desenho sumindo" 3x; IA fez o fix e diagnosticou internamente (`ONETOONE_DIAG=1`) mandando log ao renderer. O dono continuou achando o bug porque não via o Console.
- Por que passou: Mensagem gravada fora do canal primário (o terminal de inicialização).
- Regra: Defeitos reincidentes reportados humanamente requerem instrumentação que flui até os logs em que o humano vê na sua ponta terminal antes de tentar a correção cega.
- Como atacar: Como o humano acessa esse debug se ele abrir o App executável comum (sem aba "DevTools" disponível)?
- Checagem por máquina: não (dependente de redirecionamento por IPC e escopo de log).

### L-09 — Perda de documentação por descuido do chefe ao sincronizar
- Origem: `docs/reviews/fase-10.md`, seção "2. Entregas T6/T7 apagadas por engano"
- O que aconteceu: O chefe gerencial apagou partes do `ARQUITETURA.md` e o `HANDOFF` gravando revisões antigas via git revert sem checar o diff, matando o trabalho da mesma fase recém concluída.
- Por que passou: Commits de reposicionamento gerencial em arquivos comuns.
- Regra: Gerência também erra com `git`: qualquer atualização de log e documentação mestre em fases concorrentes requer checagem minuciosa do diff antes do commit e sem merge estático sujo.
- Como atacar: O arquivo de documentação possui seções recém-deletadas que continham `risco-aceito` e requisitos cruciais de 2 commits atrás?
- Checagem por máquina: sim (`verificar-afirmacoes.cjs` valendo os textos remanescentes).

## Como escrever uma ordem

### L-10 — Invenção de escopo e eventos inexistentes em relatórios
- Origem: `docs/EXPERIMENTO.md`, seção "Métricas por fase / 03"
- O que aconteceu: O executor (IA) prometeu em relatório uso de componentes "Opus" e métodos que não existiam dentro da branch nem do seu código criado.
- Por que passou: Documentação não foi varrida junto do diff de funções (o texto livre aceita promessa não implementada).
- Regra: Todo evento, arquivo, script, promessa funcional e nome exposto no texto deve apontar para existência real e local no disco. Promessas falsas de entrega arruínam o projeto.
- Como atacar: Ao citar a função X e Y na documentação do HANDOFF, um `grep` em `src` a localizará em código fonte compilado?
- Checagem por máquina: sim (`tools/verificar-afirmacoes.cjs`).
