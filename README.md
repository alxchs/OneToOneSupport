# OneToOneSupport

Plataforma Desktop Windows para Atendimento Remoto 1:1 Multimodal com Quadro Branco Colaborativo, Anotação sobre Mídias, Criptografia Ponta a Ponta (E2EE) e Geração de Relatórios em PDF.

---

## 1. Visão Geral do Produto

O **OneToOneSupport** é uma solução voltada para atendimentos individuais (aulas particulares, consultas, mentorias e orientações clínicas/técnicas). O profissional utiliza o aplicativo Host no Windows e compartilha um convite seguro (via link ou QR Code) com o aluno/paciente/cliente (Guest), que acessa diretamente pelo navegador do smartphone ou tablet — sem necessidade de instalar aplicativos adicionais.

### Principais Funcionalidades
- **Quadro Branco Colaborativo HiDPI (Sensação de Paint):** O quadro funciona como uma folha de desenho: o que você desenha não é agarrado nem movido. Não há molduras de seleção, alças ou cursores de mover durante o desenho. Ferramentas disponíveis: Lápis, Pincel, Retângulo, Elipse, Linha, Seta, Texto, Borracha (Trecho) e Borracha (Traço inteiro). Motor vetorial (Fabric.js 6) com suporte a monitores 4K em escala de 150%, sincronização bidirecional em tempo real e desfazer/refazer atômico.
- **Abas Multimodais:** Criação e ordenação de abas para quadro em branco, anotação sobre imagens, documentos PDF paginados (via PDF.js), e reprodução sincronizada de vídeo e áudio com controle de autoridade do Host.
- **Criptografia Ponta a Ponta (E2EE):** Comunicação cifrada via WebSockets com ChaCha20-Poly1305 IETF e troca de chaves X25519 (Libsodium / `sodium-native`).
- **Persistência Imutável (Event Sourcing):** Histórico completo de eventos vetoriais salvo no SQLite relacional (`better-sqlite3`), garantindo ausência de duplicidade via `WHERE NOT EXISTS` e integridade permanente.
- **Modo Leitura Histórico:** Possibilidade de rever qualquer sessão encerrada em modo somente leitura com garantia de preservação de estado e exportação em PNG HiDPI.
- **Relatório da Sessão em PDF:** Geração nativa via Electron (`webContents.printToPDF`), compilando miniaturas fiéis das abas trabalhadas, metadados da sessão e notas confidenciais.
- **Firewall Automático:** Regra no Firewall do Windows associada ao executável no perfil Privado configurada pelo instalador (NSIS).

---

## 2. Requisitos de Sistema

- **Sistema Operacional:** Windows 10 ou Windows 11 (64-bit).
- **Ambiente de Desenvolvimento:** Node.js v20+ (recomendado Node 20 LTS), npm v10+.
- **Electron:** 30.5.1 (com ABI compatível via `@electron/rebuild`).

---

## 3. Guia de Instalação e Desenvolvimento

### 3.1. Clonagem e Instalação de Dependências
```bash
git clone https://github.com/alxchs/OneToOneSupport.git
cd OneToOneSupport
npm ci
```

### 3.2. Execução em Modo de Desenvolvimento
Inicia os servidores Vite (Host e Guest) e lança o Electron com hot-reload:
```bash
npm run dev
```

### 3.3. Verificação e Testes Automatizados
O projeto adota uma disciplina de verificação com suíte completa de testes e sonda de runtime com Electron e Chromium reais:
```bash
# Executa typecheck, build, vitest e sonda de runtime (probe)
npm run verify

# Executa apenas os testes unitários e de integração (vitest)
npm test

# Executa apenas a sonda de runtime com automação E2E
npm run probe
```

---

## 4. Empacotamento e Distribuição

Para gerar os binários de produção para Windows:
```bash
npm run package   # roda o build e depois o electron-builder
```
Os artefatos finais são gerados no diretório `release/`:
1. **Instalador NSIS:** `release/OneToOneSupport Setup 1.0.0.exe` (com escolha de pasta e regra automática no Firewall; pede permissão de administrador (UAC) uma vez, porque a regra de firewall exige isso).
2. **Executável Portátil:** `release/OneToOneSupport 1.0.0.exe` (execução direta sem instalação).

### 4.1. Aviso do Windows SmartScreen
Por se tratar de um binário em versão 1.0 sem certificado Authenticode comercial:
- Na primeira execução em uma máquina com Windows Defender / SmartScreen ativo, o sistema exibirá a janela azul com o título **"O Windows protegeu o seu computador"**.
- Para prosseguir normalmente: clique em **"Mais informações"** e em seguida selecione **"Executar assim mesmo"**.

---

## 5. Limitações Conhecidas da Versão 1.0

- **Capacidade por Sessão:** 1 convidado simultâneo por sessão (`SESSION_OCCUPIED`). Atendimentos em grupo não são suportados.
- **Assinatura de Código:** Binários não assinados digitalmente por autoridade comercial (Authenticode).
- **Formatos de PDF:** Suporte a PDFs padrão; não há suporte a documentos protegidos por senha ou formulários XFA.
- **Impressão Direta:** O sistema gera o relatório consolidado em PDF; o envio físico para impressoras depende do leitor padrão do usuário.
- **Dispositivos Móveis:** A verificação automatizada usa só emulação do Chrome (perfil do Motorola Edge 70 Pro: 412x915, DPR 2.625, toque) via DevTools. O dono usou um celular real nas homologações, mas a correção do desenho por toque de 01/10/2026 ainda não foi confirmada em aparelho físico. Safari/iOS, Edge e Brave mobile não foram testados.
- **Volume de Abas:** Sessões com volumes extremos de abas (mais de 100) não foram exercitadas.