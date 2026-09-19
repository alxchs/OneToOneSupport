# ADR-006: Tratamento de Duplicidade com Soft Delete em Atendidos e Configuração Global

## Contexto
A Regra Técnica #1 do Documento Mestre exige validação estrita de duplicidade via `WHERE NOT EXISTS` em todas as colunas de negócio (exceto chave primária e timestamps). Na tabela `Atendidos`, os registros possuem controle de soft delete via `ativo INTEGER NOT NULL DEFAULT 1` e `deletado_em INTEGER`. Surge a questão: ao tentar criar um atendido com dados de negócio (`nome, contato, email, notas`) idênticos a um registro previamente desativado/deletado por soft delete, a criação deve ser autorizada gerando um novo registro, ou rejeitada informando a duplicata existente?

## Decisão
1. **Escopo Global de Duplicidade:** A consulta `WHERE NOT EXISTS (SELECT 1 FROM Atendidos WHERE nome IS ? AND contato IS ? AND email IS ? AND notas IS ?)` abrange **toda a tabela `Atendidos`**, sem filtrar `ativo = 1`. Se existir qualquer registro anterior com os mesmos dados de negócio (ativo ou inativo), a inserção não ocorre e o repositório retorna `{ created: false, reason: 'DUPLICATE', existingId }`.
2. **Reativação no Domínio:** Em vez de duplicar linhas no banco (o que corromperia a integridade de sessões vinculadas ao atendido histórico), a camada de serviço (Domain Service, Fase 02) utiliza o `existingId` retornado para oferecer ao operador a reativação do cadastro desativado.
3. **Comportamento no UPDATE:** O método `updateAtendido(id, data)` aplica a mesma salvaguarda: só efetiva a alteração se os dados resultantes não duplicarem nenhum outro registro existente (`WHERE id != ? AND nome IS ? AND contato IS ? AND email IS ? AND notas IS ?`). Caso contrário, a alteração é bloqueada e retorna `{ updated: false, reason: 'DUPLICATE', existingId }`.
4. **ConfiguracaoGlobal:** A mesma regra estrita aplica-se a `ConfiguracaoGlobal`. Tentativas de definir uma chave que já possua exatamente o mesmo valor são identificadas como duplicidade e não geram alterações redundantes.
5. **Comparação de Nulos via `IS`:** Todas as colunas anuláveis (`contato`, `email`, `notas`) são comparadas utilizando a cláusula SQL `IS ?` em vez de `= ?`, evitando a armadilha do SQL onde `NULL = NULL` resulta em NULL (falso), o que permitiria a inserção de registros duplicados contendo campos nulos.

## Consequências
- Proteção absoluta contra registros fantasmas e dispersão de histórico de atendimentos entre múltiplos cadastros.
- Rastreabilidade total das sessões históricas vinculadas à mesma pessoa física.
- Semântica previsível com retorno discriminado tipado (`created: true` vs `created: false, reason: 'DUPLICATE'`).
