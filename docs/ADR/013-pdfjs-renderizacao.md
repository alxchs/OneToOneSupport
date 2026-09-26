# ADR-013: Renderização de Documentos PDF com PDF.js (pdfjs-dist v4)

## Contexto
Na Fase 08 (Abas multimodais, assets e mídia sincronizada — M5), o sistema deve suportar abas do tipo `pdf`, permitindo visualização de páginas de documentos PDF tanto no Host (Electron/Desktop) quanto no Convidado (Guest Mobile/Web), com capacidade de anotação vetorial sobreposta e navegação de página sincronizada sob autoridade estrita do Host.
O visualizador deve operar sem depender de plugins externos, visualizadores nativos de terceiros ou serviços em nuvem, mantendo o princípio de operação 100% offline em rede local (LAN).

## Decisão
1. **Biblioteca e Versão:** Adota-se `pdfjs-dist` versão `^4.10.38` (Mozilla PDF.js, licença Apache 2.0).
2. **Método de Renderização:** O PDF é renderizado página a página em um `<canvas>` HTML oculto via `page.render({ canvasContext, viewport })`. O canvas resultante (ou `ImageBitmap` / `HTMLImageElement`) é injetado como camada de fundo (`backgroundImage`) no motor do quadro branco (`WhiteboardEngine` em `src/shared/canvas/engine.ts`), de forma idêntica ao suporte a imagens (M4).
3. **Imutabilidade do Fundo:** O fundo do PDF é estático, não selecionável, não é arrastado por ferramentas de desenho e não gera eventos de log no Event Sourcing.
4. **Contexto de Anotações por Página:** Como os traços sobrepostos pertencem à página visualizada, o identificador do contexto do quadro para eventos `DRAW_ADD` e recuperação de estado utiliza a convenção `<abaId>_p<pagina>`. Avançar ou retroceder a página restaura fielmente os traços vetoriais da respectiva página.
5. **Autoridade Estrita do Host na Paginação:** A navegação entre páginas é modelada como a mensagem de protocolo `PDF_PAGE` (`{ tabId, pagina }`), incluída na matriz `ACOES_EXCLUSIVAS_HOST`. Mensagens `PDF_PAGE` emitidas pelo Guest são sumariamente descartadas e rejeitadas pelo `SessionManager`.

## Consequências
- Visualização e renderização determinística e consistente entre Host e Guest em qualquer navegador moderno.
- Isolamento total de arquivos e preservação de integridade: o arquivo PDF original em disco nunca é modificado.
- Atendimento aos requisitos de segurança e compatibilidade com empacotamento offline do Electron e bundle do Guest.
