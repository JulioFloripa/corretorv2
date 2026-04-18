# Instruções de Deploy - Novas Funcionalidades

## 📦 Arquivos Criados

### Novos Componentes (6 arquivos)
```
src/components/student/
├── StudentSearch.tsx          # Componente de busca por matrícula
├── StudentExamsList.tsx       # Lista de provas do aluno
├── ExamAnswersEditor.tsx      # Editor de respostas questão por questão
├── PerformanceOverview.tsx    # Cards com estatísticas de desempenho
├── PerformanceChart.tsx       # Gráficos de barras e linha
└── ExamsDetailTable.tsx       # Tabela detalhada de provas
```

### Novas Páginas (2 arquivos)
```
src/pages/
├── StudentEdit.tsx            # Página de edição de respostas
└── StudentPerformance.tsx     # Página de análise de desempenho
```

### Nova Biblioteca (1 arquivo)
```
src/lib/
└── performance-stats.ts       # Funções de cálculo estatístico
```

## 🔧 Arquivos Modificados

### App.tsx
- Adicionados imports para as novas páginas
- Adicionadas 2 novas rotas:
  - `/students/edit`
  - `/students/performance`

### Dashboard.tsx
- Adicionados imports de ícones: `Edit3`, `TrendingUp`
- Adicionados 2 novos cards no array `actionCards`:
  - "Editar Respostas"
  - "Análise de Desempenho"

## 🚀 Como Fazer o Deploy

### Opção 1: Deploy no Lovable (Recomendado)

1. **Commit e Push para o GitHub:**
```bash
cd /home/ubuntu/fleming-corrector
git add .
git commit -m "feat: adiciona edição de respostas e análise de desempenho"
git push origin main
```

2. **No Lovable:**
   - Acesse https://lovable.dev
   - O Lovable detectará automaticamente as mudanças no GitHub
   - Clique em "Deploy" para publicar as alterações

### Opção 2: Deploy Manual via Git

1. **Adicionar arquivos ao Git:**
```bash
cd /home/ubuntu/fleming-corrector

# Adicionar novos arquivos
git add src/components/student/
git add src/pages/StudentEdit.tsx
git add src/pages/StudentPerformance.tsx
git add src/lib/performance-stats.ts

# Adicionar arquivos modificados
git add src/App.tsx
git add src/pages/Dashboard.tsx

# Commit
git commit -m "feat: adiciona funcionalidades de edição de respostas e análise de desempenho

- Adiciona página de edição de respostas por matrícula
- Adiciona página de análise de desempenho com gráficos
- Adiciona 6 novos componentes reutilizáveis
- Adiciona biblioteca de cálculos estatísticos
- Atualiza Dashboard com novos cards
- Adiciona rotas no App.tsx"

# Push
git push origin main
```

### Opção 3: Build Local (Teste)

1. **Instalar dependências:**
```bash
cd /home/ubuntu/fleming-corrector
pnpm install
```

2. **Verificar erros de TypeScript:**
```bash
pnpm exec tsc --noEmit
```

3. **Build de produção:**
```bash
pnpm build
```

4. **Testar localmente:**
```bash
pnpm preview
```

## ✅ Checklist Pré-Deploy

- [ ] Todas as dependências estão instaladas
- [ ] Não há erros de TypeScript
- [ ] Build de produção funciona sem erros
- [ ] Variáveis de ambiente do Supabase estão configuradas
- [ ] Rotas foram adicionadas corretamente no App.tsx
- [ ] Dashboard foi atualizado com os novos cards

## 🗄️ Banco de Dados

**Nenhuma migração necessária!** ✅

As novas funcionalidades utilizam apenas as tabelas existentes:
- `corrections`
- `student_answers`
- `templates`
- `template_questions`

## 🔐 Permissões do Supabase

Verifique se as políticas de RLS (Row Level Security) permitem:
- Leitura em `corrections`
- Leitura em `student_answers`
- **Atualização em `student_answers`** (necessário para edição)
- **Atualização em `corrections`** (necessário para recálculo de notas)

### Políticas Sugeridas (se necessário):

```sql
-- Permitir atualização de student_answers pelo dono
CREATE POLICY "Users can update their own student answers"
ON student_answers
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM corrections
    WHERE corrections.id = student_answers.correction_id
    AND corrections.user_id = auth.uid()
  )
);

-- Permitir atualização de corrections pelo dono
CREATE POLICY "Users can update their own corrections"
ON corrections
FOR UPDATE
USING (user_id = auth.uid());
```

## 🧪 Testes Recomendados

Após o deploy, testar:

### Edição de Respostas:
1. [ ] Buscar aluno por matrícula existente
2. [ ] Buscar aluno por matrícula inexistente
3. [ ] Listar provas do aluno
4. [ ] Abrir editor de uma prova
5. [ ] Editar uma resposta correta
6. [ ] Editar uma resposta incorreta
7. [ ] Verificar recálculo automático da nota
8. [ ] Cancelar edição
9. [ ] Voltar para lista de provas

### Análise de Desempenho:
1. [ ] Buscar aluno com múltiplas provas
2. [ ] Verificar cards de estatísticas
3. [ ] Verificar gráfico de barras
4. [ ] Verificar gráfico de linha
5. [ ] Verificar tabela detalhada
6. [ ] Testar com aluno com apenas 1 prova
7. [ ] Testar com aluno com 2 provas
8. [ ] Testar com aluno com 3+ provas

### Navegação:
1. [ ] Acessar via Dashboard
2. [ ] Voltar ao Dashboard
3. [ ] Testar em mobile
4. [ ] Testar em tablet
5. [ ] Testar em desktop

## 📊 Monitoramento

Após o deploy, monitorar:
- Logs do Supabase para erros de query
- Console do navegador para erros JavaScript
- Tempo de resposta das queries
- Uso de recursos do Supabase

## 🐛 Troubleshooting

### Erro: "Cannot read property 'name' of null"
**Solução:** Verificar se todas as provas têm templates associados

### Erro: "Permission denied"
**Solução:** Verificar políticas RLS do Supabase

### Gráficos não aparecem
**Solução:** Verificar se Recharts está instalado: `pnpm add recharts`

### Edição não salva
**Solução:** Verificar políticas de UPDATE no Supabase

## 📞 Suporte

Em caso de problemas:
1. Verificar logs do Supabase
2. Verificar console do navegador
3. Verificar build logs do Lovable
4. Consultar documentação do Supabase

## 🎉 Conclusão

Após seguir estas instruções, as novas funcionalidades estarão disponíveis em:
- https://fleming-corrector.lovable.app/students/edit
- https://fleming-corrector.lovable.app/students/performance

E acessíveis via Dashboard através dos novos cards.
