# ORDEM DE SERVIÇO — FASE 09: Relatório PDF
Branch: `fase/09-relatorio-pdf` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §13, `docs/HANDOFF.md`. Pré-requisitos: fases 05 e 06 mergeadas.

## Entregas
1. `electron/services/relatorio.service.ts`: template HTML (`electron/reports/templates/`) → Puppeteer → PDF. Conteúdo: nome dinâmico (rótulos do dicionário), dados cadastrais, anotações por aba, observações do Host (`notas_host`), miniaturas de cada aba geradas por `toDataURL()` a partir do estado reconstruído pelo reducer (fase 05), revisão escolhida.
2. Puppeteer sem baixar Chromium extra sem necessidade: decidir e documentar em ADR se usa o Chromium do Electron (`executablePath`) ou o do Puppeteer; medir impacto no tamanho do instalador.
3. **Segurança:** todo dado do usuário escapado no HTML (XSS no relatório), sem rede externa (`page.setRequestInterception` bloqueando tudo que não seja `data:`/arquivo local), sem `--no-sandbox` a não ser justificado em ADR.
4. Miniaturas nítidas (multiplier a partir do DPR do host), quebra de página correta, fonte embutida, cabeçalho/rodapé, paginação.
5. UI: botão "Gerar relatório" no detalhe da sessão, escolher revisão, abrir o PDF gerado; salvar em `%APPDATA%/OneToOneSupport/atendidos/<slug>/…/relatorio.pdf`.
6. Testes: nome com `<script>` e emojis/acentos, sessão sem eventos, sessão com 100 abas, PDF gerado tem páginas > 0 e texto extraível.

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`; gerar um relatório real no app e **abri-lo**; descrever o que aparece (o chefe também vai abrir).
## Aceite
PDF abre, texto correto, miniaturas fiéis ao quadro, sem requisição externa. Nada de push. HANDOFF e parar.
