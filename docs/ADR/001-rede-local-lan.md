# ADR-001: Arquitetura de Rede Local (LAN) na V1.0

## Contexto
O Documento Mestre (§6) menciona links de convite apontando para um Relay web (`https://relay.onetoonesupport.app/join/...`), mas também estabelece como princípio inegociável a operação Local-First (§4), sem tráfego de dados para fora da máquina do Host. Não há infraestrutura de relay web implantada ou provisionada no escopo inicial da V1.0.

## Decisão
Na V1.0, o fluxo de comunicação opera exclusivamente em Rede Local (LAN). O servidor Express e WebSocket hospedado no processo Electron do Host atende diretamente tanto o Guest (servindo o bundle web e conexões WS) quanto o Host, utilizando uma porta dinâmica (ou configurável) e o endereço IP da interface LAN ativa.
A URL base do convite é armazenada em `ConfiguracaoGlobal` (chave `rede.host_convite`), permitindo futura transição para um servidor de Relay sem alterar o protocolo de comunicação, caso um relay que encaminhe payloads cifrados venha a ser introduzido.

## Consequências
- Independência total de servidores em nuvem para a V1.0.
- Preservação estrita do modelo Local-First e E2EE.
- Host e Guest devem estar na mesma rede local (Wi-Fi/Ethernet) ou conectados via VPN/túnel de rede local.
