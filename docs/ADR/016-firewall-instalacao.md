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

## Correção na auditoria do chefe (2026-10-02)
O item 1 acima ("já são executados com privilégios administrativos") era falso na configuração entregue:
`electron-builder.yml` não definia `perMachine`, e o padrão do electron-builder (`perMachine=false`) instala só
para o usuário atual, **sem elevação**. Medido: instalação silenciosa `/S /currentuser` terminou com código 0 e
`netsh advfirewall firewall show rule name="OneToOneSupport"` respondeu `No rules match` — o `netsh` falhava sem
admin e o `nsExec::Exec` descartava o erro. A evidência de T2 na autoauditoria vinha de uma regra criada à mão,
elevada, fora do instalador.

Correção: `nsis.perMachine: true` (o instalador pede UAC uma vez e instala em Program Files; os dados continuam em
`%APPDATA%\OneToOneSupport`, então nada é gravado na pasta de instalação) e `build/installer.nsh` passou a usar
`nsExec::ExecToLog` + `Pop $0`, avisando o usuário se a regra não puder ser criada. Prova após a correção:
instalação elevada criou a regra (`Profiles: Private`, `Program: <pasta>\OneToOneSupport.exe`,
`Direction: In`, `Action: Allow`) e a desinstalação a removeu (`No rules match the specified criteria.`).
