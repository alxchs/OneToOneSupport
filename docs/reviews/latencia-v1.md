# Relatório de Medição Formal de Latência — V1.0

## Metadados da Execução
- **Data e Hora:** 2026-09-26T20:26:08.649Z
- **Comando Executado:** `node tools/medir-latencia.cjs`
- **Interface de Rede (LAN):** `192.168.1.200` (endereço físico de rede local do Host)
- **Porta Dinâmica Alocada:** `53713`
- **Tamanho da Amostra:** 1000 amostras completas por teste (zero warm-up descartado)
- **Criptografia Ativa:** E2EE ChaCha20-Poly1305 + X25519 (Envelope `ENCRYPTED`)
- **Critério de Aceite (Mestre §18, Critério 2):** **p95 < 200 ms**

---

## 1. Sincronização de Traços no Quadro Branco (`DRAW_ADD`)
Mede o tempo decorrido entre a emissão do evento vetorial pelo Host, transporte criptografado via WebSocket pela interface física de LAN, decifração e aplicação no estado do Guest via `reduceEvent`, e confirmação de recebimento.

| Métrica | One-Way (Host -> Guest) | Round-Trip (Confirmação Completa) | Critério V1.0 | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Média** | 1.64 ms | 4.58 ms | - | - |
| **Mínimo** | 0.32 ms | 0.86 ms | - | - |
| **p50 (Mediana)** | 0.58 ms | 2.16 ms | - | - |
| **p95** | **2.64 ms** | **10.51 ms** | **< 200 ms** | **PASS** |
| **p99** | 36.86 ms | 64.09 ms | - | - |
| **Máximo** | 125.47 ms | 221.53 ms | - | - |

---

## 2. Mídia Sincronizada (`MEDIA_CONTROL` + `MediaSyncManager`)
Mede o tempo decorrido entre o comando de reprodução/seek emitido pelo Host, transporte criptografado via LAN, processamento temporal no Guest pelo algoritmo de sincronismo (`MediaSyncManager`, Fase 08) e retorno de confirmação.

| Métrica | One-Way (Host -> Guest) | Round-Trip (Confirmação Completa) | Critério V1.0 | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Média** | 0.77 ms | 1.76 ms | - | - |
| **Mínimo** | 0.24 ms | 0.51 ms | - | - |
| **p50 (Mediana)** | 0.41 ms | 0.91 ms | - | - |
| **p95** | **1.70 ms** | **4.54 ms** | **< 200 ms** | **PASS** |
| **p99** | 7.54 ms | 20.04 ms | - | - |
| **Máximo** | 58.47 ms | 61.13 ms | - | - |

---

## 3. Conclusão e Veredito
- **Critério 2 da V1.0 (Mestre §18):** Ambos os fluxos críticos de tempo real operam com **p95 amplamente inferior a 200 ms** (DRAW_ADD p95: 10.51 ms, Mídia Sync p95: 4.54 ms), mesmo sob cifragem E2EE em cada envelope e tráfego pela interface física de LAN (`192.168.1.200`).
- **Veredito:** **APROVADO (PASS)**.
