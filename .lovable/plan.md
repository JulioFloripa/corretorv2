
# Recalcular Correções ao Alterar Gabarito

## O que muda para o usuario

Ao editar um gabarito e salvar, ou na tela de historico, havera um botao "Recalcular" que reprocessa todas as correcoes vinculadas aquele gabarito usando as respostas brutas ja armazenadas (tabela `student_answers`), sem precisar reenviar o arquivo.

## Como funciona

A tabela `student_answers` ja armazena a `student_answer` (resposta do aluno) para cada questao. O recalculo:

1. Busca as questoes atualizadas do gabarito (`template_questions`)
2. Para cada correcao vinculada ao template, percorre as `student_answers`
3. Recalcula `is_correct`, `correct_answer` e `points_earned` com base no gabarito atualizado
4. Atualiza `total_score`, `max_score` e `percentage` na correcao

## Onde o botao aparece

1. **Tela de Gabarito (`TemplateEdit.tsx`)**: Ao salvar o gabarito, se ja existirem correcoes vinculadas, exibe um dialogo perguntando se deseja recalcular automaticamente.
2. **Tela de Historico (`History.tsx`)**: Botao "Recalcular" por template (agrupado) para disparar manualmente.

## Detalhes tecnicos

### Funcao de recalculo (novo arquivo `src/lib/recalculate.ts`)

```text
recalculateByTemplate(templateId)
  |
  +-- Buscar template_questions WHERE template_id
  +-- Buscar corrections WHERE template_id
  +-- Para cada correction:
       +-- Buscar student_answers WHERE correction_id
       +-- Para cada answer:
       |    +-- Encontrar question correspondente (por question_number)
       |    +-- Recalcular is_correct, correct_answer, points_earned
       |    +-- UPDATE student_answers
       +-- Somar total_score, max_score
       +-- UPDATE corrections (total_score, max_score, percentage)
```

### Alteracoes em arquivos

1. **Novo: `src/lib/recalculate.ts`** - Funcao reutilizavel `recalculateByTemplate(templateId)` que faz todo o processamento.

2. **`src/pages/TemplateEdit.tsx`** - Ao salvar (`handleSaveQuestions`), verificar se existem correcoes para o template. Se sim, mostrar um `AlertDialog` perguntando se deseja recalcular. Se confirmar, chamar `recalculateByTemplate`.

3. **`src/pages/History.tsx`** - Adicionar botao "Recalcular" no header ou por template para disparar o recalculo manual. Usar um `Select` de template + botao, ou agrupar correcoes por template com opcao de recalcular cada grupo.

### Nao requer mudancas no banco de dados

Todos os dados necessarios (respostas brutas dos alunos) ja estao armazenados na tabela `student_answers`. Nenhuma migracao e necessaria.
