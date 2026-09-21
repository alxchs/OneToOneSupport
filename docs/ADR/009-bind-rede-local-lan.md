# ADR-009: Escuta do Servidor HTTP/WS em 0.0.0.0 na Rede Local (LAN)

## Contexto
O Documento Mestre (§11) e o ADR-001 definem a operação da plataforma OneToOneSupport prioritariamente em Rede Local (LAN). Para que o convidado (Guest) conecte seu dispositivo móvel (Android via navegador) ao servidor do Host sem a necessidade de intervenção manual prévia na seleção da interface de rede em ambientes com múltiplos adaptadores (Wi-Fi, Ethernet, adaptadores virtuais), o servidor Express e WebSocket foi configurado para escutar em `0.0.0.0`.

## Decisão
Manter a escuta do servidor HTTP e WebSocket vinculada a `0.0.0.0` nas fases iniciais e intermediárias de desenvolvimento e homologação em rede local. A implementação de regras dinâmicas de firewall do Windows (Netsh / Windows Filtering Platform), isolamento estrito por interface física selecionada e hardening de bind por interface física ficam alocados para a Fase 10 (Segurança, Rede e Ciclo de Vida), conforme planejado no Documento Mestre (§14) e em `docs/FASES.md`.

## Consequências
- Conectividade imediata na LAN entre dispositivos no mesmo segmento de rede.
- O sinal de risco estático de bind em todas as interfaces (`BIND_TODAS_INTERFACES`) é explicitamente aceito e mapeado como decisão arquitetural do ADR-001/ADR-009.
- O endurecimento da camada de transporte e políticas de firewall serão implementados de forma consolidada e auditada na Fase 10.
