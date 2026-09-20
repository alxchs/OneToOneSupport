# ADR-005: Content Security Policy (CSP) do Guest e Conexões WebSocket

## Contexto
O Documento Mestre (§14) determina uma política de CSP estrita (`default-src 'self'`). No entanto, a aplicação do Guest precisa estabelecer conexões WebSocket de baixa latência com o servidor do Host (`ws:` e `wss:`), além de renderizar mídias locais e quadros via blobs/data URLs (`blob:`, `data:`). Uma diretiva `default-src 'self'` isolada bloquearia conexões WebSocket e carregamento de mídias em memória pelo canvas.

## Decisão
A política CSP enviada nos cabeçalhos HTTP do servidor Express para a interface do Guest é ajustada para:
```
default-src 'self';
connect-src 'self' ws: wss:;
img-src 'self' blob: data:;
media-src 'self' blob:;
style-src 'self' 'unsafe-inline';
script-src 'self';
object-src 'none';
base-uri 'self';
```
Para o Host no Electron, a CSP é aplicada via cabeçalhos HTTP em `session.defaultSession.webRequest.onHeadersReceived` de forma igualmente estrita, proibindo scripts remotos e inline desnecessários.

## Consequências
- Conexões WebSocket e renderização de mídia funcionam sem advertências ou bloqueios do navegador.
- Bloqueio estrito de injeção de scripts externos, mantendo a superfície de ataque mínima.
