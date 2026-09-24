# Issues - limpeza do andaime de diagnóstico da caçada (2026-09-24)

A caçada ao "desenho some ao soltar o mouse" (~10 rodadas, ver `docs/reviews/postmortem-desenho-some.md`)
deixou no código do produto mecanismos que existiam só para diagnosticar, e cuja hipótese foi DESCARTADA
quando a causa raiz real apareceu (upper-canvas opaco, commit `099787e`). O app roda em milhares de
computadores: não pode carregar andaime de investigação em produção.

Regra que vale aqui: **não apagar nada que ainda protege contra regressão**. Diagnóstico sob
`ONETOONE_DIAG=1` que hoje é barato e pode ajudar no próximo bug pode ficar — mas o que roda no caminho
quente do desenho em produção, ou que só existiu para uma hipótese morta, sai. O D14 separa um do outro com
critério, não no chute.
