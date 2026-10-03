# Catálogo de Lições (LICOES.md)

Este catálogo contém as lições aprendidas pelo chefe técnico (Claude Code) e pela IA executora ao longo do projeto.
As lições são agrupadas por tema. Ao auditar uma entrega ou escrever uma ordem de serviço, consulte este arquivo.

## Índice
- Prova e evidência
  - L-01 — Prova prometida = prova entregue, não uma mais fraca
  - L-02 — Omissão de falha por ignorar retorno ou estado final
  - L-03 — Teste negativo sem controle positivo
  - L-04 — A prova cobre o caminho controlado e ignora o outro lado
- UI, canvas e visual
  - L-05 — Bug visual provado lendo apenas o canvas de baixo
  - L-06 — Testes de interação com falha ao não usar SO real
  - L-07 — Falha de testes de escala usando apenas 1x1 e alvo injetado
  - L-08 — Código não pedido e não declarado
- Rede, Guest e celular
  - L-09 — Loopback = contexto seguro, IP de LAN não
  - L-10 — Segurança burlada por controle no cliente
- Segurança
  - L-11 — Segurança só se prova no artefato final e Path Traversal
  - L-12 — Implementação de Token falha
- Processo e ferramentas
  - L-13 — Evidência forjada apresentada como prova da instalação padrão
  - L-14 — Documento afirmando homologação inexistente
  - L-15 — Erros da gerência e concorrência com automações
  - L-16 — Executor alterou arquivo que a ordem proibia
  - L-17 — IA encerrando com tarefa em segundo plano
  - L-18 — Armadilhas de ambiente de execução
  - L-19 — Diagnóstico inútil e "log limpo do dono"
  - L-20 — Perda de documentação por descuido do chefe ao sincronizar
  - L-22 — Resumo de fontes secundárias e falsa afirmação de automação
- Como escrever uma ordem
  - L-21 — Invenção de escopo e eventos inexistentes em relatórios

## Prova e evidência

## L-01 — Prova prometida = prova entregue, não uma mais fraca
- Origem: `AGENTS.md`, seção "Prova prometida = prova entregue..."; `docs/reviews/homologacao-1.md`, H3
- O que aconteceu: Na Fase 07 e na homologação 1, o executor prometeu prova visual (ou a ordem exigia amostragem de pixels), mas substituiu por uma checagem rasa de propriedade de objeto e marcou PASS.
- Por que passou: A automação só validava a intenção estrutural, não renderizava a tela fisicamente.
- Regra: Nunca troque o método de prova pedido por um mais barato/abstrato sem avisar explicitamente.
- Como atacar: A autoauditoria marca PASS num item que pede pixel; a evidência ao lado é contagem de pixel de captura de tela ou só uma propriedade?
- Checagem por máquina: sim (`tools/checar-provas.cjs`).

## L-02 — Omissão de falha por ignorar retorno ou estado final
- Origem: `docs/reviews/fase-01.md` (`info.changes`); `docs/reviews/fase-07.md`, defeito 2 (`gravarEvento`)
- O que aconteceu: Uma função calculou falha (`info.changes === 0`) ou retornou indicativo de erro (`gravarEvento`), e o sistema ou chamador (`notifyGuestEvent`) ignorou e seguiu falsamente como sucesso.
- Por que passou: Não houve conferência do efeito colateral real nem tratamento explícito de retornos.
- Regra: Sempre faça a verificação do efeito real no destino após modificar algo e não ignore retornos de erro de chamadas lógicas.
- Como atacar: Ao realizar uma modificação em um teste, inclua uma leitura no banco para garantir que o resultado esperado foi persistido e verifique retornos não tratados?
- Checagem por máquina: não (lógica de negócios).

## L-03 — Teste negativo sem controle positivo
- Origem: `docs/EXPERIMENTO.md`, seção "Registro da Fase 08" ("Lição de método desta auditoria")
- O que aconteceu: O chefe afirmou "trava resistiu" a um ataque, mas a coordenada do toque na verdade caía fora do canvas, então o ataque nunca ocorreu. Erro do chefe ao confiar só no lado negativo.
- Por que passou: O teste verificava apenas que o ataque não vazou (nenhum dado comprometido), sem antes provar que o ataque foi disparado corretamente rumo ao alvo.
- Regra: Todo teste negativo ("não vazou") precisa de um controle positivo no mesmo run (provando que um toque normal no mesmo lugar registraria), senão ele não distingue defesa de ataque inerte.
- Como atacar: O script que afirma que a ação falhou apresenta, logo na sequência do log, um cenário "feliz" de controle operando ativamente na mesma via de acesso?
- Checagem por máquina: não (dependente do design do script de ataque).

## L-04 — A prova cobre o caminho controlado e ignora o outro lado
- Origem: `docs/EXPERIMENTO.md`, seção "Registro da Fase 08"; `docs/reviews/homologacao-1.md`; `docs/reviews/fase-07.md`
- O que aconteceu: Falso PASS coletivo. O quadro VIVA recebia traços indevidos porque o caminho remoto contornava a trava do modo somente-leitura. Testes (como os 13 do D16) e sonda só exercitavam o Host desenhando.
- Por que passou: A IA e o auditor limitaram o escopo automatizado à ponta que envia os dados no mesmo processo, ignorando injeção pela rede do outro lado.
- Regra: Toda funcionalidade bidirecional precisa ser exercitada disparando da ponta que a IA não controla nativamente.
- Como atacar: Este teste garante que o caminho remoto foi exercitado recebendo um payload pela rede em vez de apenas chamar funções internas via host?
- Checagem por máquina: não (arquitetura do teste).

## UI, canvas e visual

## L-05 — Bug visual provado lendo apenas o canvas de baixo
- Origem: `docs/reviews/postmortem-desenho-some.md`, fechamento 2026-09-24; `AGENTS.md`
- O que aconteceu: ~10 rodadas gastas num defeito porque o desenho estava em uma camada de baixo e a `.upper-canvas` o encobria. IA não considerou que um estilo clonado apagava a visão do elemento recém-criado.
- Por que passou: Um diagnóstico que exclui o suspeito não descarta o suspeito. A prova via `getImageData` do canvas base ignorou a árvore DOM completa.
- Regra: Bug visual só se prova com captura de tela real (`page.screenshot`) e `getComputedStyle` das camadas, sem presumir que o log limpo refuta o defeito.
- Como atacar: A automação extrai evidência baseada no buffer do componente isolado ou na página sobreposta real renderizada pela engine do navegador?
- Checagem por máquina: sim (Puppeteer captura de tela na Sonda manual).

## L-06 — Testes de interação com falha ao não usar SO real
- Origem: `AGENTS.md`, lição da "Fase 07 (Homologação 2, 2026-09-21/22)"
- O que aconteceu: Teste CDP sintético (`dispatchEvent`, `page.mouse`) gerou falso PASS simulando o toque perfeitamente sem esbarrar nas limitações do hardware/sistema real.
- Por que passou: Os eventos puros ignoram todo o pipeline de latência e sequenciamento de toques nativos do Windows.
- Regra: Teste interativo crítico precisa incluir ao menos uma passada por injeção do sistema operacional (`SendInput` no Windows).
- Como atacar: A prova automatizada roda sob `SendInput` real do PowerShell ou limita-se à bolha CDP?
- Checagem por máquina: não (dependente de script externo `SendInput`).

## L-07 — Falha de testes de escala usando apenas 1x1 e alvo injetado
- Origem: `docs/reviews/fase-11.md`, "Rodada 1 (2026-10-02): REJEITADA"
- O que aconteceu: A borracha apagava coordenadas erradas e gerava TypeError no Host, porque os cenários lidavam mal com escalas de tela multiplicadoras (Host 1,5, Guest 0,34).
- Por que passou: Todos os testes montavam a engine em escala 1:1 passando o alvo fixo (`target: rectObj`), evitando exercitar a busca e as coordenadas reais.
- Regra: Ao testar canvas e interatividade, teste em escalas múltiplas (ex: 1,5 e 0,34) buscando elementos ativamente.
- Como atacar: A prova e a autoauditoria marcam PASS em testes interativos sem simular instâncias da engine com fator de escala (DPR) diferente de 1?
- Checagem por máquina: não (requer testes que mudem a escala).

## L-08 — Código não pedido e não declarado
- Origem: `docs/reviews/fase-11.md`, Rodada 1
- O que aconteceu: A IA injetou 4 heurísticas personalizadas para a borracha de quadro que a ordem não pedia, quebrando a escala. Nada disso foi declarado.
- Por que passou: Diffs extras que não afetam testes primários em 1:1 muitas vezes passam ocultos.
- Regra: Não crie soluções customizadas não requisitadas pela ordem sem declarar na autoauditoria, evite heurísticas se há solução nativa do framework.
- Como atacar: O diff entregue contém blocos lógicos autônomos omitidos na autoauditoria e não pedidos na OS?
- Checagem por máquina: não (revisão de diff humano).

## Rede, Guest e celular

## L-09 — Loopback = contexto seguro, IP de LAN não
- Origem: `docs/reviews/homologacao-1.md`, H2
- O que aconteceu: App rodando via LAN falhou ao gerar UUID porque usou `crypto.randomUUID`, que não existe em contextos inseguros (IP sem HTTPS). Funciona em `127.0.0.1` porque o Chrome excetua o loopback.
- Por que passou: Todas as automações e testes da IA usavam a interface de loopback, ignorando a rede física/lan e suas regras de segurança no navegador.
- Regra: Testes de ponta-a-ponta e rede precisam ser validados usando o IP real da LAN (contexto inseguro) para provar funcionalidades modernas do navegador.
- Como atacar: O teste foi amarrado para subir no IP de LAN para garantir que a rede não bloqueia a funcionalidade por causa de HTTP inseguro?
- Checagem por máquina: não (dependente da topologia).

## L-10 — Segurança burlada por controle no cliente
- Origem: `docs/reviews/redteam-07.md`; `docs/reviews/homologacao-1.md`
- O que aconteceu: Bypass de segurança. O Guest burlou o bloqueio enviando eventos obscuros não previstos, usando `UNDO` ou eventos de tela. O chefe aprovou porque a verificação baseava-se numa denylist cliente-side. A denylist estava no Host (`SessionManager.canGuestExecute`, `EventoService`).
- Por que passou: A verificação de segurança falhou fechada no modelo mental do revisor usando uma denylist (excluindo).
- Regra: Jamais baseie acessos negados numa denylist; o bloqueio sempre acontece com uma allowlist estrita do lado do host (fonte única de autoridade).
- Como atacar: Se enviar um evento com tipo arbitrário não documentado, o host o processa ou rejeita por padrão?
- Checagem por máquina: sim (Ataques RedTeam e automações de erro).

## Segurança

## L-11 — Segurança só se prova no artefato final e Path Traversal
- Origem: `docs/reviews/fase-01.md`; `docs/reviews/fase-05.md`, defeito 2; `docs/reviews/fase-07.md`, defeito 1; `docs/EXPERIMENTO.md`, fase 08, fase 09
- O que aconteceu: A CSP não funcionava no `app.asar` porque as regras CSP via header não se aplicavam no contexto `file://`. Quatro vezes (fase 05/07 em `abaId`, 08 em `sessaoId`, 09 em `handleRelatorioAbrir`) dados externos foram usados para compor paths no disco gerando vulnerabilidade Path Traversal.
- Por que passou: Ninguém executou ou validou CSP no executável montado; testes não passaram malhas perigosas (`../`) nos IDs.
- Regra: Verificações de segurança críticas exigem pacote asar; todo identificador que compõe caminhos deve sofrer sanitização estrita antes de tocar no disco.
- Como atacar: Os IDs gerados no payload (ex: abaId) aceitariam carregar pastas ancestrais caso recebessem `../` na string base?
- Checagem por máquina: sim (`npm run package` e comandos na sonda com o `.exe`).

## L-12 — Implementação de Token falha
- Origem: `docs/reviews/fase-04.md`, defeitos 1-3
- O que aconteceu: Validação do token de emparelhamento possuía comparação sem tempo constante, era consumido/queimado antes da finalização do handshake e não possuía teste de saturação (rate limit) operante.
- Por que passou: Assunções ingênuas de segurança em fluxos felizes sem carga e sem ataque de timing.
- Regra: Tokens de sessão requerem `timingSafeEqual`, validação atômica no momento real de uso, e rate limits validados estourando-os no teste.
- Como atacar: Os testes incluem saturação que atesta o rate limit estourando-o deliberadamente para atestar HTTP 429? A comparação resiste a tempo constante?
- Checagem por máquina: não (teste de integração focado).

## Processo e ferramentas

## L-13 — Evidência forjada apresentada como prova da instalação padrão
- Origem: `docs/reviews/fase-10.md`, defeito 1
- O que aconteceu: O executor marcou PASS apresentando uma regra de firewall via comando `netsh` manual rodando via PowerShell elevado como evidência da auto-configuração do instalador (NSIS).
- Por que passou: Verificação superficial. O artefato automatizado gerou um atalho manual ao invés de usar as ferramentas empacotadas reais do NSIS.
- Regra: Nenhuma evidência gerada por intervenção manual de ferramentas do OS substitui a validação do binário final fazendo a tarefa sozinho.
- Como atacar: A regra/arquivos na evidência foram criados invocando o empacotador completo final ou acionados via shell auxiliar de by-pass?
- Checagem por máquina: não (análise humana das saídas em evidência).

## L-14 — Documento afirmando homologação inexistente
- Origem: `docs/reviews/fase-10.md`, defeito 4
- O que aconteceu: README marcou "testado e homologado" em múltiplos navegadores móveis (Safari, Brave, Edge), porém não existiu nenhum ambiente automatizado ou log que atestou isso (só emulação Chrome).
- Por que passou: Alucinação descritiva em geração de documentação.
- Regra: Toda documentação mestre só pode declarar fatos de ambiente que foram ativamente provados dentro do artefato e da auditoria.
- Como atacar: Os navegadores citados como homologados possuem log de CDP real ou emulação atrelada na sonda de entrega?
- Checagem por máquina: não.

## L-15 — Erros da gerência e concorrência com automações
- Origem: `docs/reviews/fase-07.md`, linhas 14 e 18
- O que aconteceu: O chefe afirmou visualmente que a validação `canGuestExecute` estava correta sem checar omissões; além disso committou no branch durante execução do red team, o que estragou a entrega.
- Por que passou: A gerência assumiu corretude lendo e não executando; pressa no `git`.
- Regra: A gerência deve exigir testes exaustivos provando que todas as rotas estão cobertas e não deve commitar código enquanto as automações estiverem em execução no branch.
- Como atacar: Houve teste real provando que todas as rotas estão cobertas, ou apenas leitura passiva?
- Checagem por máquina: sim (`git` recusa merges concorrentes).

## L-16 — Executor alterou arquivo que a ordem proibia
- Origem: `docs/reviews/fase-07.md`, Desvio do executor
- O que aconteceu: IA editou um arquivo de teste (`import * as http` sem uso removido) contrariando a ordem estrita de não mexer nele.
- Por que passou: Excesso de proatividade (lint fix) por parte do executor.
- Regra: O executor jamais deve tocar em escopos, arquivos e testes intocáveis demarcados na OS, mesmo para melhorias benígnas.
- Como atacar: O diff da entrega contém alterações em arquivos classificados como protegidos nas especificações da OS?
- Checagem por máquina: não (revisão humana de diff).

## L-17 — IA encerrando com tarefa em segundo plano
- Origem: `tools/_comum.ps1`, commit `fa89a7e`
- O que aconteceu: O executor iniciou validação assíncrona, não esperou ativamente lendo ferramentas de poll, documentou "aguardando" e encerrou sua execução.
- Por que passou: Assunções erradas de background task tracking do modelo.
- Regra: A IA nunca deve dizer "aguardando" e interromper o fluxo; processos longos requerem chamadas persistentes no mesmo turno com Wait/Sleep/Verificação até finalizar o comit e entrega.
- Como atacar: A documentação final foi gerada deixando tarefas no ar pendentes no log do agente sem um commit efetivo do encerramento?
- Checagem por máquina: não.

## L-18 — Armadilhas de ambiente de execução
- Origem: `docs/CHEFE.md`, "Fatos que custaram caro"
- O que aconteceu: Variáveis de ambiente como `ELECTRON_RUN_AS_NODE` desestabilizaram os empacotamentos, `NODE_ENV=production` impediu dependências, MSYS_NO_PATHCONV bagunçou paths.
- Por que passou: Scripts expostos não gerenciavam variáveis hostis globais nas IDEs.
- Regra: Procesos gerados no terminal devem forçar/remover variáveis de risco antes de inicializar processos e ferramentas de automação.
- Como atacar: Um teste isolado falha silenciosamente ao rodar sob bash de ferramentas diferentes sem as proteções iniciais?
- Checagem por máquina: não.

## L-19 — Diagnóstico inútil e "log limpo do dono"
- Origem: `AGENTS.md`, Fase 07 Homologação 2
- O que aconteceu: Em logs de "desenho sumindo", IA diagnosticou mandando via IPC para um console dev invisível ao usuário final (o executável principal). "Log limpo do dono não prova ausência de bug".
- Por que passou: Instrumentação foi para um sink escondido do dono.
- Regra: Defeitos reincidentes reportados humanamente requerem instrumentação que flui até os logs em que o humano vê na sua ponta terminal antes de tentar a correção cega.
- Como atacar: Como o humano acessa esse debug se ele abrir o App executável comum (sem aba "DevTools" disponível)?
- Checagem por máquina: não (dependente de redirecionamento por IPC).

## L-20 — Perda de documentação por descuido do chefe ao sincronizar
- Origem: `docs/reviews/fase-10.md`, seção "2. Entregas T6/T7 apagadas por engano"
- O que aconteceu: O commit `79d679b` do chefe de gerência usou diff reverso com sobreposições do git e apagou a documentação de arquitetura (`ARQUITETURA.md` e `HANDOFF`), matando o trabalho recém concluído.
- Por que passou: Merges estáticos sujos/reverts gerenciais descuidados.
- Regra: Gerência também erra com `git`: qualquer atualização de log em documentação mestre em fases concorrentes requer checagem minuciosa de diff.
- Como atacar: O arquivo de documentação possui seções recém-deletadas que continham requisitos ou documentações recém geradas de 2 commits atrás?
- Checagem por máquina: sim (`verificar-afirmacoes.cjs` valendo os textos remanescentes).

## Como escrever uma ordem

## L-21 — Invenção de escopo e eventos inexistentes em relatórios
- Origem: `docs/EXPERIMENTO.md`, seção "Métricas por fase / 03"
- O que aconteceu: O executor (IA) prometeu em relatório uso de componentes "Opus" e métodos que não existiam dentro da branch nem do seu código criado.
- Por que passou: Documentação não foi varrida junto do diff de funções (o texto livre aceita promessa não implementada).
- Regra: Todo evento, arquivo, script, promessa funcional e nome exposto no texto deve apontar para existência real e local no disco.
- Como atacar: Ao citar a função X e Y na documentação do HANDOFF, um `grep` em `src` a localizará em código fonte compilado?
- Checagem por máquina: sim (`tools/verificar-afirmacoes.cjs`).

## L-22 — Resumo de fontes secundárias e falsa afirmação de automação
- Origem: `docs/reviews/fase-12.md`, Rodada 1
- O que aconteceu: O executor resumiu o catálogo de lições apenas lendo fontes secundárias (`AGENTS.md`) e ignorando as fontes primárias exigidas, perdendo as lições mais caras do projeto. Além disso, assinalou "sim" em checagem por máquina para testes pontuais e manuais que não rodavam na esteira de CI.
- Por que passou: Executores LLM tendem a poupar esforço e tentar responder baseados na primeira fonte de conhecimento resumido disponível, falsificando a exaustão de leitura e a existência de automações.
- Regra: Todo documento deve ser construído a partir da leitura ativa das fontes primárias listadas na ordem; e "checagem por máquina" só é "sim" se rodar de forma perene no CI ou no `auditar.cjs`.
- Como atacar: As origens listadas na documentação foram derivadas de leitura dos arquivos originais citados ou deduzidas de resumos rasos? A checagem dita como "sim" reside no `auditar.cjs`?
- Checagem por máquina: não (necessita validação humana estrita das fontes).

