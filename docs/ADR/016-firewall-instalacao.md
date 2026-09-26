# ADR-016: Configuração de Firewall do Windows na Instalação (NSIS)

## Contexto
O servidor local do OneToOneSupport (Express 4 e WebSocket, implementados na Fase 04) foi projetado para escutar em porta dinâmica atribuída pelo sistema operacional (`port: 0`), garantindo que o aplicativo nunca sofra conflitos de porta com outros serviços na máquina do profissional.

Por operar em porta efêmera dinâmica:
1. É inviável registrar uma regra estática por número de porta no Firewall do Windows.
2. Solicitar elevação de privilégios (UAC) a cada inicialização do aplicativo em tempo de execução prejudicaria a experiência do usuário e violaria o princípio de menor privilégio.
3. Sem uma regra de entrada no Firewall, o Windows bloqueia conexões do convidado (Guest) via rede local (LAN) ou exibe diálogos confusos do sistema.

## Decisão
1. **Configuração Elevada no Instalador (NSIS):**
   Utilizar os hooks de ciclo de vida do instalador NSIS (`customInstall` e `customUnInstall` via `build/installer.nsh` e `electron-builder.yml`), que já são executados com privilégios administrativos durante o processo de instalação.
2. **Regra por Caminho do Executável:**
   A regra de firewall é associada exclusivamente ao caminho do binário instalado (`program="$INSTDIR\OneToOneSupport.exe"`), dispensando a fixação de portas e garantindo que apenas o executável do OneToOneSupport receba tráfego de entrada.
3. **Restrição ao Perfil Privado (`profile=private`):**
   A regra de permissão de entrada (`dir=in action=allow`) é restrita estritamente ao perfil de rede Privada (`profile=private`). É terminantemente proibida a abertura em perfis `public` ou `domain`, impedindo qualquer exposição em redes Wi-Fi públicas ou não confiáveis.
4. **Reversibilidade Obrigatória na Desinstalação:**
   No momento em que o aplicativo é desinstalado, o macro `customUnInstall` invoca silenciosamente a exclusão da regra (`netsh advfirewall firewall delete rule name="OneToOneSupport"`), não deixando resíduos na tabela de regras do sistema operacional.

## Consequências
- Instalação limpa e transparente sem diálogos adicionais de UAC durante o uso diário do aplicativo.
- Conexão do Guest mobile via Wi-Fi/LAN local permitida sem atrito.
- Zero exposição em redes públicas (perfil `public` permanece bloqueado por padrão).
- Remoção completa da regra quando o usuário desinstala o produto.
