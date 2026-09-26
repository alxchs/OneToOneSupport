# ADR-015: Geração de Relatório em PDF via API Nativa do Electron (printToPDF)

## Contexto
O plano original de fases (`docs/FASES.md`) previa a geração de relatórios de atendimento em PDF utilizando a biblioteca `puppeteer` (`^22.15.0`). Embora o `puppeteer` já estivesse presente no repositório como ferramenta exclusiva de testes e automação em tempo de desenvolvimento (`tools/probe-runtime.cjs`), seu uso em produção no empacotamento (`electron-builder`) traria sérias desvantagens de distribuição:
1. **Duplicação de Chromium:** O Puppeteer baixa e empacota seu próprio binário do Chromium (~150–200 MB compactado, ~350–450 MB descompactado em disco), mesmo o instalador do Electron já trazendo uma instância completa e atualizada do Chromium.
2. **Inchaço do Instalador:** O instalador final distribuído para os clientes teria seu tamanho desnecessariamente dobrado sem qualquer ganho funcional.
3. **Consumo de Memória e Inicialização:** Lançar um subprocesso independente do Puppeteer consome centenas de megabytes de RAM adicionais em comparação com a criação de uma janela interna fora de tela gerenciada pelo processo principal do Electron.

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
- Economia estimada de ~150 MB a ~200 MB no instalador final do produto por não empacotar um segundo Chromium.
- Renderização visual HiDPI fiel às dimensões 4K @150% do Host (ADR-003).
- Janela estritamente isolada e à prova de vazamentos de rede ou injeções de scripts externos.
