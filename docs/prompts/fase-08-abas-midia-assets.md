# ORDEM DE SERVIÇO — FASE 08: Abas multimodais, mídia sincronizada e assets
Branch: `fase/08-abas-midia-assets` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §10, §11, §12, §14, `docs/HANDOFF.md`. Pré-requisitos: fases 04, 05 e 07 mergeadas.

## Entregas
1. `Abas` (`blank|image|pdf|video|audio`): criar, ordenar, trocar (`TAB_SWITCH`). Quadro sobre imagem/PDF (página como fundo, anotações por cima em eventos, nunca modificando o original).
2. Importação de assets (`asset.service.ts`, `asset.repo.ts`): sha256, mime por assinatura (não confiar na extensão), limite de tamanho configurável, nome sanitizado profundamente (path traversal: `..`, separadores, nomes reservados do Windows, unicode confuso), armazenados fora do webroot.
3. Servir mídia ao Guest por Express com **Range Requests** (206), com token de sessão; nunca expor path do disco.
4. PDF: renderização com pdf.js (ADR se nova dependência) no Host e no Guest.
5. Sincronia de mídia: `play/pause/seek` via WS cifrado; servidor como relógio mestre (posição = base + delta do relógio do servidor); correção de deriva suave; Guest só controla com `UNLOCK_MEDIA`; volume/equalização locais; teste de deriva.
6. Encerramento de sessão: copiar assets para `%APPDATA%/OneToOneSupport/atendidos/<slug_atendido>/<YYYYMMDD_HHMM_sessao_id>/`, conferindo o hash após copiar; falha parcial não perde nada (não apagar origem antes de verificar). `slug` seguro e único.
7. Testes: sanitização (lista de nomes maliciosos), Range (início/meio/fim/inválido), hash pós-cópia, arquivamento real em diretório temporário.

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`; app aberto: importar imagem, PDF, vídeo, áudio; Host e Guest em sincronia; encerrar sessão e **listar fisicamente** a pasta em `%APPDATA%` com hashes conferidos (colar a saída).
## Aceite
Critérios "Assets copiados fisicamente" e sincronia medida (registrar ms). Nada de push. HANDOFF e parar.
