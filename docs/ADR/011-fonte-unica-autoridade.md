# ADR-011: Fonte Única de Verdade para Autoridade e Matriz de Permissões Host x Guest

## Contexto
Durante a auditoria adversarial da Fase 07 (Guest Mobile), o time de Red Team identificou 5 vulnerabilidades relacionadas a autoridade, integridade de sessão e estado (`redteam-fase07.test.ts` e `docs/reviews/redteam-07.md`).
Uma análise de causa-raiz evidenciou que a validação de permissões do Convidado (Guest) sofria do mesmo defeito em dois componentes distintos:
1. `EventoService.validarAutorEPermissao`: na rodada anterior, usava uma denylist aberta antes de receber correções preliminares.
2. `SessionManager.canGuestExecute`: operava sob denylist que concluía com `{ allowed: true }`, permitindo que o Guest emitisse ações reservadas ao Host (`SCREEN_LOCKED`) e tipos arbitrários não reconhecidos (`ARBITRARY_ACTION_TYPE`), além de não vetar `UNDO` sob tela bloqueada (`screenLocked === true`).

A duplicação das regras de autoridade entre a camada de aplicação/serviço (`EventoService`) e a camada de rede/sessão (`SessionManager`) gerava risco de divergência futura, onde uma ação bloqueada no WebSocket pudesse ser aceita no Event Sourcing, ou vice-versa.

## Decisão
Criar o módulo compartilhado `src/shared/autoridade.ts` como a **fonte única da verdade** de autoridade, matriz de permissões e listas de controle para todo o sistema (Host Electron e Guest Browser).

### Princípios da Matriz de Autoridade:
1. **Allowlist Estrita do Guest (`ACOES_PERMITIDAS_GUEST`):**
   O Guest é estritamente proibido de emitir qualquer tipo que não esteja explicitamente autorizado:
   - Ações interativas no quadro branco (`ACOES_INTERATIVAS_GUEST`): `DRAW_ADD`, `DRAW_HIDE`, `UNDO`, `REDO`.
   - Ações de controle de mídia (`ACOES_MIDIA_GUEST`): `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL`.
   - Ação local do Guest (`ACOES_LOCAIS_GUEST`): `GUEST_MUTED`.
   Qualquer outro tipo (vazio, desconhecido, chave de protótipo como `__proto__`, `constructor`, `toString`) é rejeitado com `{ allowed: false, reason: 'FORBIDDEN_ACTION' }`.

2. **Ações Exclusivas do Host (`ACOES_EXCLUSIVAS_HOST`):**
   `CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA`, `TAB_SWITCH` e `SCREEN_LOCKED` pertencem exclusivamente ao Host e são terminantemente proibidas ao Guest.

3. **Bloqueio de Tela (`screenLocked === true`):**
   Bloqueia sumariamente todas as ações interativas e de mídia do Guest com `reason: 'SCREEN_LOCKED'`. Inclui expressamente `UNDO` e `REDO`.
   A ação `GUEST_MUTED` permanece permitida ao Guest mesmo com tela bloqueada, pois representa o controle local do microfone (garantia de privacidade e sigilo do atendido).

4. **Controle de Mídia Condicionado (`mediaUnlocked`):**
   As ações `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL` exigem simultaneamente `screenLocked === false` e `mediaUnlocked === true`. Caso contrário, são bloqueadas com `MEDIA_LOCKED` (ou `SCREEN_LOCKED` se a tela estiver travada).

5. **Consumo Unificado:**
   - `SessionManager.canGuestExecute` consome `canGuestExecuteAction`.
   - `EventoService.validarAutorEPermissao` consome `validarAutorEPermissaoCompartilhada`.
   Ambos garantem, por construção funcional, vereditos de autorização estritamente idênticos para o Guest em qualquer combinação de parâmetros.

6. **Integridade de Desconexão e TTL de Reconexão:**
   - `SessionManager.handleGuestDisconnect`: apenas a conexão ativa autenticada pode alterar o estado para `reconectando`. Desconexões não-autenticadas ou probes espúrios são sumariamente descartados.
   - `reconnectExpiresAt` é carimbado exclusivamente em `completeHandshake` e NUNCA é recalculado ou estendido em desconexões sucessivas.

## Consequências
- Eliminação definitiva de denylists abertas e da causa raiz de divergências de autoridade.
- Proteção integral contra injeção de ações arbitrárias e desvio de controle de tela bloqueada.
- Validação contínua garantida por suite adversarial dedicada (`tests/adversarial/autoridade-fonte-unica.test.ts`), que testa exaustivamente todos os tipos conhecidos e inválidos.
