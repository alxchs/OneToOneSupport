# ADR-015: Geração de Relatório em PDF via API Nativa do Electron (printToPDF)

## Contexto
O plano original de fases (`docs/FASES.md`) previa a geração de relatórios de atendimento em PDF utilizando a biblioteca `puppeteer` (`^22.15.0`). O `puppeteer` já estava presente no repositório como ferramenta exclusiva de testes e automação em tempo de desenvolvimento (`tools/probe-runtime.cjs`), e seu uso em produção no empacotamento (`electron-builder`) traria desvantagens:
1. **Correção (2026-09-26, revisão do chefe na Fase 10):** o `.npmrc` do projeto já tem `puppeteer_skip_download=true`
   (com `runtime=electron`/`target=30.5.1`), então o `puppeteer` instalado aqui **nunca baixou um Chromium
   próprio** — `node_modules/puppeteer` mede ~420 KB no disco, e `tools/probe-runtime.cjs` sempre aponta
   `executablePath`/`connect()` para o binário do próprio Electron via CDP. A estimativa original desta ADR
   ("~150–200 MB compactado evitados") **não se aplicava a este repositório** e foi uma afirmação copiada da
   situação genérica do Puppeteer sem reverificar a configuração real do projeto — exatamente o tipo de erro que
   `AGENTS.md` pede para não repetir. O ganho real de tamanho de instalador por evitar Puppeteer em produção é
   próximo de zero **neste projeto**; risco-aceito corrigido, decisão abaixo mantida por outros motivos.
2. **Motivo real da decisão (revisado):** rodar `printToPDF` nativo evita depender, em produção, de uma porta de
   depuração CDP (`--remote-debugging-port`) e de um processo de automação externo — superfície de ataque e
   complexidade operacional menores, e nenhum código de terceiros no caminho de escrita em disco do relatório.
   `puppeteer` seguiria existindo só como dependência de teste/dev (como já era).

## Decisão
1. **Adoção da API Nativa do Electron:** Utilizar exclusivamente um `BrowserWindow` interno fora de tela (`show: false`) e a API nativa `webContents.printToPDF(options)` do Electron (`node_modules/electron/electron.d.ts`), eliminando 100% de duplicação do Chromium e zero dependências novas em produção.
2. **Descarte do Puppeteer em Produção:** O Puppeteer permanece estritamente restrito a ferramentas de desenvolvimento e testes sintéticos (`tools/probe-runtime.cjs`), sem ser importado nem referenciado em nenhum serviço de produção (`electron/` ou `src/`).
3. **Isolamento de Segurança e Janela Offline:**
   - A janela fora de tela opera com sandbox estrito (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`).
   - Preload dedicado e mínimo (`electron/reports/preload-relatorio.ts`), sem expor acesso ao sistema de arquivos nem IPC de negócio.
   - Interceptação obrigatória de requisições de rede (`webRequest.onBeforeRequest`): bloqueio rigoroso de qualquer tráfego que não seja `file://` local, `data:` ou `blob:`, garantindo uma janela 100% offline.
4. **Reaproveitamento de Miniaturas Offscreen:**
   - As miniaturas das abas são renderizadas dentro da mesma janela offscreen de impressão reaproveitando diretamente o motor gráfico vetorial do projeto (`WhiteboardEngine` e `PdfDocumentViewer`), exportadas como PNG (`toDataURL({ multiplier: devicePixelRatio })`) e embutidas como `data:` URI no documento HTML.
   - Descarte sequencial de cada instância de engine (`engine.dispose()`), mantendo o consumo de memória estável mesmo para sessões com dezenas de abas.
5. **Gravação Atômica de Arquivo:**
   - O buffer do PDF gerado é gravado primeiro em arquivo temporário isolado (`relatorio.pdf.<uuid>.tmp`) e renomeado atomicamente para `relatorio.pdf` na pasta permanente da sessão do atendido, prevenindo relatórios parciais ou corrompidos em caso de falha.

## Consequências
- Zero dependências npm adicionadas ao projeto.
- **Correção:** não há economia de tamanho de instalador por Chromium duplicado neste projeto (ver item 1 do
  Contexto) — o ganho real é não depender de CDP/porta de depuração em produção e não rodar código de
  automação de terceiros no caminho de geração do relatório.
- Renderização visual HiDPI fiel às dimensões 4K @150% do Host (ADR-003).
- Janela estritamente isolada e à prova de vazamentos de rede ou injeções de scripts externos.
