/**
 * Shared student upsert utility.
 *
 * Rule: `matricula` is the global primary identifier for a student.
 * - If a student with the same `matricula` does NOT exist → insert.
 * - If it DOES exist and the incoming data has NO meaningful differences → update
 *   only previously-null fields (safe merge, never overwrites existing data).
 * - If there ARE meaningful differences → return a `StudentConflict` so the
 *   caller can ask the user which version to keep.
 */

import { supabase } from "@/integrations/supabase/client";

export interface IncomingStudentData {
  nome: string;
  matricula: string | null;
  campus?: string | null;
  email?: string | null;
  foreign_language?: string | null;
}

export interface ConflictField {
  field: keyof IncomingStudentData;
  label: string;
  existingVal: string;
  incomingVal: string;
}

export interface StudentConflict {
  matricula: string;
  existingDbId: string;
  existing: IncomingStudentData & { id: string };
  incoming: IncomingStudentData;
  conflictFields: ConflictField[];
}

export type UpsertResult =
  | { status: "created"; id: string }
  | { status: "updated"; id: string }
  | { status: "conflict"; conflict: StudentConflict }
  | { status: "error"; message: string };

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  campus: "Sede / Campus",
  email: "E-mail",
  foreign_language: "Idioma",
};

function hasConflict(existingVal: string | null | undefined, incomingVal: string | null | undefined): boolean {
  if (!existingVal || !incomingVal) return false; // one side is empty → safe to fill in
  return existingVal.trim().toLowerCase() !== incomingVal.trim().toLowerCase();
}

/**
 * Upsert a single student.
 * Returns a conflict descriptor if any non-null field would be overwritten.
 */
export async function upsertStudent(data: IncomingStudentData): Promise<UpsertResult> {
  if (!data.nome || data.nome.length > 255) {
    return { status: "error", message: "Nome inválido" };
  }

  if (!data.matricula) {
    // No matricula — try to find by exact name
    const { data: byName } = await supabase
      .from("alunos")
      .select("id, nome, matricula, campus, email, foreign_language")
      .eq("nome", data.nome)
      .maybeSingle();

    if (byName) {
      // Same name, no matricula — safe update of null fields only
      const patch: Record<string, string | null> = {};
      if (!byName.campus && data.campus) patch.campus = data.campus;
      if (!byName.email && data.email) patch.email = data.email;
      if (!byName.foreign_language && data.foreign_language) patch.foreign_language = data.foreign_language;
      if (Object.keys(patch).length > 0) {
        await supabase.from("alunos").update(patch).eq("id", byName.id);
      }
      return { status: "updated", id: byName.id };
    }

    const { data: inserted, error } = await supabase
      .from("alunos")
      .insert({ nome: data.nome, campus: data.campus, email: data.email, foreign_language: data.foreign_language })
      .select("id")
      .single();
    if (error) return { status: "error", message: error.message };
    return { status: "created", id: inserted.id };
  }

  // matricula provided — look up existing student
  const { data: existing } = await supabase
    .from("alunos")
    .select("id, nome, matricula, campus, email, foreign_language")
    .eq("matricula", data.matricula)
    .maybeSingle();

  if (!existing) {
    const { data: inserted, error } = await supabase
      .from("alunos")
      .insert({
        nome: data.nome,
        matricula: data.matricula,
        campus: data.campus ?? null,
        email: data.email ?? null,
        foreign_language: data.foreign_language ?? null,
      })
      .select("id")
      .single();
    if (error) return { status: "error", message: error.message };
    return { status: "created", id: inserted.id };
  }

  // Check for conflicts (only when existing field is non-null and differs)
  const conflictFields: ConflictField[] = [];
  const checkFields: Array<keyof IncomingStudentData> = ["nome", "campus", "email", "foreign_language"];
  for (const field of checkFields) {
    const existingVal = (existing as any)[field] as string | null;
    const incomingVal = data[field] as string | null | undefined;
    if (hasConflict(existingVal, incomingVal ?? null)) {
      conflictFields.push({
        field,
        label: FIELD_LABELS[field] || field,
        existingVal: existingVal!,
        incomingVal: incomingVal!,
      });
    }
  }

  if (conflictFields.length > 0) {
    return {
      status: "conflict",
      conflict: {
        matricula: data.matricula,
        existingDbId: existing.id,
        existing: { ...existing, id: existing.id },
        incoming: data,
        conflictFields,
      },
    };
  }

  // No conflict — safe update: fill in nulls, always update nome
  const patch: Record<string, string | null> = { nome: data.nome };
  if (!existing.campus && data.campus) patch.campus = data.campus;
  if (!existing.email && data.email) patch.email = data.email;
  if (!existing.foreign_language && data.foreign_language) patch.foreign_language = data.foreign_language;
  // Also update non-null fields when they match direction of change (campus/language provided)
  if (data.campus) patch.campus = data.campus;
  if (data.foreign_language) patch.foreign_language = data.foreign_language;

  await supabase.from("alunos").update(patch).eq("id", existing.id);
  return { status: "updated", id: existing.id };
}

/**
 * Apply a user's merge choice for a conflict: overwrite existing fields with
 * incoming data ("new") or keep everything as-is ("existing").
 */
export async function applyMergeChoice(
  conflict: StudentConflict,
  choice: "existing" | "new"
): Promise<void> {
  if (choice === "existing") return; // nothing to do — keep DB as-is

  const patch: Record<string, string | null> = { nome: conflict.incoming.nome };
  if (conflict.incoming.campus !== undefined) patch.campus = conflict.incoming.campus ?? null;
  if (conflict.incoming.email !== undefined) patch.email = conflict.incoming.email ?? null;
  if (conflict.incoming.foreign_language !== undefined)
    patch.foreign_language = conflict.incoming.foreign_language ?? null;

  await supabase.from("alunos").update(patch).eq("id", conflict.existingDbId);

  // Also update student_name in corrections to match chosen name
  if (conflict.incoming.nome !== conflict.existing.nome) {
    await supabase
      .from("corrections")
      .update({ student_name: conflict.incoming.nome })
      .eq("student_id", conflict.matricula);
  }
}
