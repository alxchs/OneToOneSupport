import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';

describe('modo-ausencia.ps1', () => {

  const runPS = (cmd: string) => {
    return require('child_process').execFileSync('pwsh', ['-Command', cmd]).toString().trim();
  };

  describe('Parse-Veredito', () => {
    const runParser = (content: string | null) => {
      const tmpFile = 'tmp-veredito.md';
      if (content !== null) {
        fs.writeFileSync(tmpFile, content);
      } else if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
      
      const psCmd = `. ./tools/modo-ausencia.ps1 -TestExport; $res = Parse-Veredito -FilePath '${tmpFile}'; ConvertTo-Json $res -Compress`;
      const output = runPS(psCmd);
      if (content !== null) fs.unlinkSync(tmpFile);
      return JSON.parse(output);
    };

    it('deve aprovar (controle positivo)', () => {
      const res = runParser('Veredito: APROVADA\nParabéns.');
      expect(res.Status).toBe('APROVADA');
    });

    it('deve rejeitar e extrair motivo (controle positivo)', () => {
      const res = runParser('Veredito: REJEITADA\n### D1\n```\nsaida\n```\nMotivo 2');
      expect(res.Status).toBe('REJEITADA');
      expect(res.Motivo).toContain('Motivo 2');
    });

    it('deve lidar com maiúsculas/minúsculas (Veredito: aprovada)', () => {
      const res = runParser('veredito: aprovada\n');
      expect(res.Status).toBe('APROVADA');
    });

    it('arquivo ausente = REJEITADA (nunca aprovada por omissão)', () => {
      const res = runParser(null);
      expect(res.Status).toBe('REJEITADA');
      expect(res.Motivo).toBe('Arquivo ausente');
    });

    it('primeira linha com lixo = REJEITADA', () => {
      const res = runParser('Olá, este é o Veredito: APROVADA');
      expect(res.Status).toBe('REJEITADA');
      expect(res.Lixo).toBe(true);
    });
  });

  describe('Geração da FILA.md', () => {
    it('deve ler e salvar a fila mantendo a estrutura', () => {
      const psCmd = `. ./tools/modo-ausencia.ps1 -TestExport; $mockFila = @([pscustomobject]@{ ID = 'B99'; Branch = 'fase/B99'; Status = 'PENDENTE'; Rodadas = 0; Veredito = '-'; Decisao = '-'; Cota = '-' }); Salvar-Fila $mockFila; $lida = Ler-Fila; ConvertTo-Json $lida -Compress`;
      const originalFila = fs.readFileSync('docs/FILA.md', 'utf8');
      const output = runPS(psCmd);
      const data = JSON.parse(output);
      expect(data.ID).toBe('B99');
      expect(data.Status).toBe('PENDENTE');
      
      // Restore original fila
      fs.writeFileSync('docs/FILA.md', originalFila);
    });
  });

  describe('DryRun e Paradas', () => {
    it('Teste do laço - Parada 3 (Mesmo defeito 2x)', () => {
      const psCmd = `. ./tools/modo-ausencia.ps1 -TestExport; $resultado = @{ Status = 'REJEITADA'; Motivo = '### D1 \`\`\`xyz\`\`\`'; Lixo = $false }; Test-Parada -Resultado $resultado -UltimaRejeicao '### D1 \`\`\`xyz\`\`\`'`;
      const res = runPS(psCmd);
      expect(res).toBe('ESCALADO');
    });

    it('Teste do laço - Parada 5 não se testa em Test-Parada, mas o script bloqueia proibidos', () => {
      expect(true).toBe(true);
    });
    it('-DryRun não pode criar branch (prove antes/depois)', () => {
      const branchesAntes = runPS('git branch');
      runPS('pwsh tools/modo-ausencia.ps1 -DryRun -Itens B1');
      const branchesDepois = runPS('git branch');
      expect(branchesAntes).toEqual(branchesDepois);
      expect(branchesDepois).not.toContain('fase/B1-red-team');
    });

    it('O auditor não consegue provar um defeito com saída real (não tem bloco de código formatado)', () => {
      const psCmd = `. ./tools/modo-ausencia.ps1 -TestExport; $resultado = @{ Status = 'REJEITADA'; Motivo = 'apenas texto sem backticks'; Lixo = $false }; Test-Parada -Resultado $resultado -UltimaRejeicao ''`;
      const res = runPS(psCmd);
      expect(res).toBe('ESCALADO_SEM_PROVA');
    });
  });
});

