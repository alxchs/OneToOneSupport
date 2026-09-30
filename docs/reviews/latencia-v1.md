# Relatório de Medição Formal de Latência — V1.0

## Metadados da Execução
- **Data e Hora:** 2026-09-29T09:41:48.856Z
- **Comando Executado:** `node tools/medir-latencia.cjs`
- **Interface de Rede (LAN):** `192.168.1.200` (endereço físico de rede local do Host)
- **Porta Dinâmica Alocada:** `54689`
- **Tamanho da Amostra:** 1000 amostras completas por teste (zero warm-up descartado)
- **Criptografia Ativa:** E2EE ChaCha20-Poly1305 + X25519 (Envelope `ENCRYPTED`)
- **Critério de Aceite (Mestre §18, Critério 2):** **p95 < 200 ms**

---

## 1. Sincronização de Traços no Quadro Branco (`DRAW_ADD`)
Mede o tempo decorrido entre a emissão do evento vetorial pelo Host, transporte criptografado via WebSocket pela interface física de LAN, decifração e aplicação no estado do Guest via `reduceEvent`, e confirmação de recebimento.

| Métrica | One-Way (Host -> Guest) | Round-Trip (Confirmação Completa) | Critério V1.0 | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Média** | 0.38 ms | 1.26 ms | - | - |
| **Mínimo** | 0.18 ms | 0.65 ms | - | - |
| **p50 (Mediana)** | 0.32 ms | 1.08 ms | - | - |
| **p95** | **0.80 ms** | **2.44 ms** | **< 200 ms** | **PASS** |
| **p99** | 1.41 ms | 3.48 ms | - | - |
| **Máximo** | 2.56 ms | 5.77 ms | - | - |

---

## 2. Mídia Sincronizada (`MEDIA_CONTROL` + `MediaSyncManager`)
Mede o tempo decorrido entre o comando de reprodução/seek emitido pelo Host, transporte criptografado via LAN, processamento temporal no Guest pelo algoritmo de sincronismo (`MediaSyncManager`, Fase 08) e retorno de confirmação.

| Métrica | One-Way (Host -> Guest) | Round-Trip (Confirmação Completa) | Critério V1.0 | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Média** | 0.26 ms | 0.57 ms | - | - |
| **Mínimo** | 0.15 ms | 0.32 ms | - | - |
| **p50 (Mediana)** | 0.19 ms | 0.42 ms | - | - |
| **p95** | **0.51 ms** | **1.11 ms** | **< 200 ms** | **PASS** |
| **p99** | 1.16 ms | 2.26 ms | - | - |
| **Máximo** | 4.39 ms | 16.47 ms | - | - |

---

## 3. Conclusão e Veredito
- **Critério 2 da V1.0 (Mestre §18):** Ambos os fluxos críticos de tempo real operam com **p95 amplamente inferior a 200 ms** (DRAW_ADD p95: 2.44 ms, Mídia Sync p95: 1.11 ms), mesmo sob cifragem E2EE em cada envelope e tráfego pela interface física de LAN (`192.168.1.200`).
- **Veredito:** **APROVADO (PASS)**.
