# ADR-008: Biblioteca de Geração de QR Code (qrcode)

## Contexto
O Documento Mestre (§11) e a Ordem de Serviço da Fase 04 determinam a exibição de link de convite e código QR no Host para permitir a conexão instantânea do Guest via dispositivo móvel (Android / câmera). No modelo Local-First (ADR-001) e sem dependência de serviços em nuvem, a geração do código QR deve ocorrer 100% offline dentro do processo Node/Electron do Host, sem qualquer requisição externa a APIs de terceiros.

## Decisão
Adotar a biblioteca `qrcode` (versão 1.5.x), leve e sem dependências nativas em C++ (pure JavaScript). A geração do QR Code é realizada no processo Main através de `QRCode.toDataURL(inviteUrl, { margin: 2, scale: 6 })`, produzindo uma Data URL base64 (`image/png`) ou SVG diretamente em memória para exibição no Renderer.

## Consequências
- Geração estritamente local e offline do código QR, preservando a soberania e privacidade da sessão (E2EE e Local-First).
- Nenhuma dependência nativa adicional para compilação via `@electron/rebuild`, minimizando o impacto no bundle e tempo de compilação.
- O resultado é entregue via IPC tipado ao Renderer, mantendo o isolamento de contexto (contextIsolation).
