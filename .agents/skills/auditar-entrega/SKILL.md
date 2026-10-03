---
name: auditar-entrega
description: O método rigoroso para auditar entregas de desenvolvimento (IA executora), executando código, testes e validações contra invenção.
---

# Auditar Entrega (Chefe / Auditor)

Como auditor ou chefe técnico, o seu papel é desconfiar ativamente da documentação entregue. Não aprove nada antes de testar a funcionalidade na prática.

## Passo 1: Clone limpo e Automação Básica
1. Se estiver num ambiente limpo, clone o repositório ou obtenha a branch; se na mesma, execute o comando de auditoria automatizado:
   ```powershell
   node tools/auditar.cjs
   ```
2. Analise os resultados de `npm ci`, verificações estáticas, e a Sonda. 
3. **Leia o diff** minuciosamente nas áreas de maior risco (componentes de borda, I/O e interfaces visuais).

## Passo 2: O Checklist de Ataque de LICOES.md
As validações manuais ou adições de script do auditor **PRECISAM atacar os erros mais cometidos (vistos em `docs/LICOES.md`)**:
- **L-01**: A evidência da autoauditoria é contagem de pixel ou só uma propriedade estrutural que ignora CSS?
- **L-02**: Ao realizar uma modificação em um teste, incluiu leitura real no banco/componente final em vez de confiar no valor retornado/calculado?
- **L-03**: Todo teste negativo ("não vazou") possui um cenário de controle operando ativamente na mesma via para provar que a rota está viva?
- **L-04**: O teste cobriu ambos os lados da rede, simulando injeção do lado não nativo do teste (ex: do Guest no app Host)?
- **L-05**: Testes visuais verificaram a renderização final real (`page.screenshot`) e o CSS em vez de inspecionar `getImageData` de canvas ocultos?
- **L-06**: Interações de clique e arraste rodaram via `SendInput` do PowerShell nativo, escapando da abstração sintética CDP?
- **L-07**: Testes interativos simularam fator de escala DPR (ex. 1.5, 0.34) e buscaram elementos de fato, ou dependeram de alvos injetados (`target: obj`) na escala 1x1?
- **L-08**: O diff possui implementações paralelas "úteis" ou blocos heurísticos não exigidos e não declarados no HANDOFF?
- **L-09**: Testes de ponta a ponta usaram o IP local real da LAN para garantir restrições de contexto não-seguro HTTP do navegador (ao invés de loopback/127.0.0.1)?
- **L-10**: Eventos e privilégios são garantidos por uma lista restrita no backend em vez de dependentes da não-ação descrita via cliente?
- **L-11**: Testes com pacote `asar` rodaram? Todo identificador recebido na rede (ex: `abaId`, `sessaoId`) e usado como caminho foi sanitizado contra injeções (`../`)?
- **L-12**: O token resiste a ataque de tempo constante? Há limite estourado intencionalmente para teste?
- **L-13**: Provas de instalação sistêmicas são geradas a partir do empacotador limpo ou comandos ad-hoc elevados pelo autor da prova?
- **L-14**: Homologações e testes externos declarados possuem logs anexados comprovando sua real viabilização?
- **L-15**: Commits simultâneos com execução de scripts foram barrados? A aprovação originou-se de automação ou "olhômetro" precipitado?
- **L-16**: Arquivos proibidos de alteração permanecem intactos?
- **L-17**: Os processos rodaram ativamente ou a IA interrompeu-se alegando "aguardando em segundo plano"?
- **L-18**: Os testes desativam variáveis (`ELECTRON_RUN_AS_NODE`) para garantir execução neutra?
- **L-19**: Logs de debug fluem para onde o humano enxerga? 
- **L-20**: Diffs em documentações foram comparados cirurgicamente contra reversão burra?
- **L-21**: As promessas funcionais em texto e Handoff passam via `grep` no código?
- **L-22**: As origens listadas na documentação foram derivadas de leitura dos arquivos originais citados? A checagem sistêmica classificada como "sim" reside ativamente no auditar?

## Passo 3: Ataque Negativo e Controle Positivo
- Todo teste negativo gerado para invalidar ou estourar a entrega ("não vazou") deve obrigatoriamente possuir um **controle positivo** na mesma bateria (provando, no mesmo run, que o ataque **aconteceu de verdade** e alcançou o alvo — ex.: se o teste ataca envio de dados bloqueados, o controle deve provar primeiro que dados legítimos são recebidos corretamente naquele fluxo). Sem isso, "não vazou" não distingue defesa de ataque inerte. Não é apenas um teste de caminho feliz para garantir que a base não quebrou; é provar que a rota testada está viva.

## Passo 4: O Veredito de Avaliação
Elabore o relatório e grave em `docs/reviews/fase-NN.md`. Siga rigorosamente este formato:

1. Resultado final: **APROVADA** ou **REJEITADA**
2. Se REJEITADA, liste e enumere os defeitos (Defeitos numerados) junto da prova real:
   - Caminho/linha.
   - Trecho que causa o problema e evidência/log real do `node tools/auditar.cjs` ou script provador.
3. Se APROVADA, liste as ressalvas menores (algo que não quebra o produto mas requer anotação).
4. O que **não foi verificado** (limitações físicas do auditor, impossibilidade de rodar hardware específico, ou testes desativados com aviso ao Dono).
