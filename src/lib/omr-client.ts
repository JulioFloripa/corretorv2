import { supabase } from "@/integrations/supabase/client";

export async function generateBatch(templateId: string, studentIds?: string[]) {
  const { data, error } = await supabase.functions.invoke("omr-generate-batch", {
    body: { template_id: templateId, student_ids: studentIds },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as {
    success: boolean;
    zip_url: string;
    expires_at: string;
    sheet_count: number;
    sheets_created: number;
  };
}

export async function scanBatch(templateId: string, scanPaths: string[]) {
  const { data, error } = await supabase.functions.invoke("omr-scan-batch", {
    body: { template_id: templateId, scan_paths: scanPaths },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as {
    success: boolean;
    processed: number;
    submission_ids: string[];
    summary: { total: number; ok: number; failed: number };
  };
}

export async function uploadScansToBucket(
  templateId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const paths: string[] = [];
  let done = 0;
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${templateId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage
      .from("omr-scans")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Falha ao enviar ${file.name}: ${error.message}`);
    paths.push(path);
    done++;
    onProgress?.(done, files.length);
  }
  return paths;
}

export async function getScanSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("omr-scans")
    .createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message || "Erro ao gerar URL");
  return data.signedUrl;
}