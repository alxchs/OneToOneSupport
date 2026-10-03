# Auditoria da Fase 11 (Quadro com sensação de Paint)

**Veredito: REJEITADA**

## Defeitos encontrados

1. **Borracha (Traço inteiro) apaga Borracha (Trecho), ressuscitando traços apagados**
   - **Regra violada:** P4 (a borracha inteira deve apagar elementos de negócio, e a borracha de trecho continua sendo a forma de apagar pedaços; se a borracha inteira apagar a de trecho, o que foi apagado reaparece).
   - **Arquivo:linha:** `src/shared/canvas/engine.ts` (~linha 779), dentro de `handleEraserAction`.
   - **Cenário concreto que falha:** O usuário faz um traço longo. Depois usa a Borracha (Trecho) e apaga um pedaço do meio. Ficam dois pedaços visíveis e um `eraser_stroke` invisível no meio. Depois o usuário passa a Borracha (Traço inteiro) por cima de tudo. Em vez de apagar os pedaços, o Fabric entrega o `eraser_stroke` (que tem `evented: true` por natureza) como `opt.target` antes mesmo da busca espacial. O script não filtra `tipo !== 'eraser_stroke'` na via do `opt.target`, apaga a borracha de trecho e o traço original reaparece inteiro.
   - **Prova:** Teste de ataque escrito pelo chefe em `tests/adversarial/sombra-11-borracha.test.ts`. O evento `DRAW_HIDE` é disparado tendo o `eraser_stroke` como alvo, falhando a expectativa de que o alvo ficasse intocado.
   - **Confiança:** 100% (Provado).

## O que foi verificado e passou
- Remoção completa do botão da ferramenta de Seleção da barra do Host (P1).
- Fallback automático e seguro para a ferramenta de Lápis em casos de herança de abas ou recarregamento (P1).
- O fluxo de digitação de Texto: as alças de redimensionar e rotacionar sumiram; o cursor é de texto; a edição contínua está perfeita (não cai mais para Seleção e tem o debounce correto para não criar objetos fantasmas no clique duplo) (P2, P3).
- Prova de pixel real (sonda V8) que confirmou **zero pixels** de moldura em todas as ferramentas, tanto no Host com injeção de SO (`SendInput`) quanto no celular com emulação CDP (P5, P7).
- A mudança completa dos cursores (`crosshair`, borracha SVG personalizada na ponta 2,22) que nunca caem para `move` (P4).

## O que NÃO foi verificado
- O impacto da mudança em sistemas operacionais não-Windows (Mac/Linux), pois o uso de `SendInput` no teste E2E e o empacotamento NSIS validados são exclusivos de Windows.
- Dispositivo celular físico; a automação validou por emulação rigorosa (Chromium com dimensões e toques do Edge 70 Pro).
