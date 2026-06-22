import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://supabase.flemingfloripa.com.br";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNzQ1OTU3LCJleHAiOjIwOTYxMDU5NTd9.ry3A5SbXnPH0SgIKLRNRv0Rf9IH3GCV17xRZ0D1TwEc";

export async function generateBatch(templateId: string, studentIds?: string[], day?: number) {
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/omr-generate-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token || SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ template_id: templateId, student_ids: studentIds, day }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const message = contentType.includes("application/json")
      ? (await response.json())?.error
      : await response.text();
    throw new Error(message || `Erro ${response.status} ao gerar gabaritos`);
  }

  if (!contentType.includes("application/json")) {
    const zip = await response.blob();
    const sheetCount = Number(response.headers.get("x-sheet-count")) || studentIds?.length || 0;
    return {
      success: true,
      zip_url: URL.createObjectURL(zip),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      sheet_count: sheetCount,
      sheets_created: sheetCount,
    };
  }

  const data = await response.json();
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