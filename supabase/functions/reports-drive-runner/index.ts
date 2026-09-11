// Staff/back-office helper for the Revenue Reports pipeline: pulls a client's
// source files straight out of the shared Google Drive folder into a report run,
// and pushes the finished pack back into a dated Drive subfolder.
//
// Actions
//  - list_folder  { folder_id }                       → files in that Drive folder
//  - import_run   { property_id, source_type, as_of_date, report_month,
//                   title?, cadence?, files: [{ id, name, role }] }
//                                                     → { run_id, imported }
//  - attach_files { run_id, files: [...] }             → { imported }
//  - push_pack    { run_id, parent_folder_id, folder_name }
//                                                     → { uploaded: [...] }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";


const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const driveHeaders = () => {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lovableKey || !connectionKey) throw new Error("Google Drive connection is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
};

async function driveJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GATEWAY}${path}`, { headers: driveHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function driveDownload(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: driveHeaders(),
  });
  if (!res.ok) throw new Error(`[${res.status}] ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Multipart upload of one binary into a Drive folder. */
async function driveUpload(
  name: string,
  parentId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const boundary = `rol${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = JSON.stringify({ name, parents: [parentId] });
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return String((JSON.parse(text) as { id?: string }).id ?? "");
}

async function driveFolder(name: string, parentId: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const found = await driveJson(
    `/drive/v3/files?q=${encodeURIComponent(
      `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  const existing = (found.files as { id: string }[] | undefined)?.[0];
  if (existing?.id) return existing.id;

  const res = await fetch(`${GATEWAY}/drive/v3/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parentId], mimeType: "application/vnd.google-apps.folder" }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return String((JSON.parse(text) as { id?: string }).id ?? "");
}

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sanitize = (filename: string): string => filename.replace(/[^\w.\-]+/g, "_").slice(-120);

const mimeFor = (name: string): string =>
  name.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : name.toLowerCase().endsWith(".xls")
      ? "application/vnd.ms-excel"
      : name.toLowerCase().endsWith(".html")
        ? "text/html"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface DriveFileRef {
  id: string;
  name: string;
  role?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "list_folder") {
      const folderId = String(body.folder_id ?? "");
      if (!folderId) return json({ error: "folder_id is required" }, 400);
      const data = await driveJson(
        `/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}` +
          `&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=200&orderBy=name` +
          `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      );
      return json({ files: data.files ?? [] });
    }

    /** Downloads Drive files into a run's storage prefix + ledger rows. */
    const attach = async (runId: string, propertyId: string, files: DriveFileRef[]) => {
      const { data: existing } = await supabase
        .from("report_source_files")
        .select("file_hash")
        .eq("run_id", runId);
      const seen = new Set((existing ?? []).map((r) => r.file_hash).filter(Boolean) as string[]);

      const imported: { name: string; status: string; message?: string }[] = [];
      for (const file of files) {
        try {
          const bytes = await driveDownload(file.id);
          const hash = await sha256(bytes);
          if (seen.has(hash)) {
            imported.push({ name: file.name, status: "skipped" });
            continue;
          }
          const role = file.role === "prior_report" ? "prior_report" : "source";
          const path = `${propertyId}/${runId}/${role === "prior_report" ? "prior" : "source"}/${crypto.randomUUID()}-${sanitize(file.name)}`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, bytes, { upsert: false, contentType: mimeFor(file.name) });
          if (upErr) throw upErr;
          const { error: insErr } = await supabase.from("report_source_files").insert({
            run_id: runId,
            storage_path: path,
            original_filename: file.name,
            byte_size: bytes.length,
            file_hash: hash,
            file_role: role,
          });
          if (insErr) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw insErr;
          }
          seen.add(hash);
          imported.push({ name: file.name, status: "imported" });
        } catch (error) {
          imported.push({
            name: file.name,
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return imported;
    };

    if (action === "import_run" || action === "attach_files") {
      const files = (Array.isArray(body.files) ? body.files : []) as DriveFileRef[];
      if (!files.length) return json({ error: "files is required" }, 400);

      let runId = String(body.run_id ?? "");
      let propertyId = String(body.property_id ?? "");

      if (action === "import_run") {
        if (!propertyId) return json({ error: "property_id is required" }, 400);
        const { data: previous } = await supabase
          .from("report_runs")
          .select("id")
          .eq("property_id", propertyId)
          .order("as_of_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: run, error } = await supabase
          .from("report_runs")
          .insert({
            property_id: propertyId,
            as_of_date: String(body.as_of_date ?? new Date().toISOString().slice(0, 10)),
            report_month: body.report_month ? String(body.report_month) : null,
            title: body.title ? String(body.title) : null,
            cadence: body.cadence === "monthly" ? "monthly" : "bimonthly",
            source_type: String(body.source_type ?? "nightsbridge"),
            special_report_set: body.special_report_set ? String(body.special_report_set) : null,
            status: "draft",
            previous_run_id: previous?.id ?? null,
          })
          .select("id, property_id")
          .single();
        if (error) throw error;
        runId = run.id;
        propertyId = run.property_id;
      } else {
        if (!runId) return json({ error: "run_id is required" }, 400);
        const { data: run, error } = await supabase
          .from("report_runs")
          .select("property_id")
          .eq("id", runId)
          .maybeSingle();
        if (error) throw error;
        if (!run) return json({ error: "Run not found" }, 404);
        propertyId = run.property_id;
      }

      const imported = await attach(runId, propertyId, files);
      return json({ run_id: runId, imported });
    }

    /** Diagnostic: first rows of every sheet of a Drive workbook. */
    /** Diagnostic: extras workbook totals grouped by description prefix. */
    if (action === "probe_extras") {
      const fileId = String(body.file_id ?? "");
      if (!fileId) return json({ error: "file_id is required" }, 400);
      const bytes = await driveDownload(fileId);
      const wb = XLSX.read(bytes, { type: "array", cellDates: true });
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
        header: 1,
        blankrows: false,
        raw: true,
      }) as unknown[][];
      const groups: Record<string, { total: number; rows: number }> = {};
      let grand = 0;
      for (const row of grid.slice(2)) {
        const description = String(row[3] ?? "").trim();
        const total = Number(row[6]);
        if (!description || !Number.isFinite(total)) continue;
        const key = description.split(",")[0]!.trim();
        groups[key] = { total: (groups[key]?.total ?? 0) + total, rows: (groups[key]?.rows ?? 0) + 1 };
        grand += total;
      }
      return json({ grand, groups });
    }

    /** Diagnostic: plain text of a Drive PDF, for comparing a filed pack. */
    if (action === "probe_pdf") {
      const fileId = String(body.file_id ?? "");
      if (!fileId) return json({ error: "file_id is required" }, 400);
      const bytes = await driveDownload(fileId);
      const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
      const pdf = await getDocumentProxy(bytes);
      const { text, totalPages } = await extractText(pdf, { mergePages: true });
      return json({ total_pages: totalPages, text: String(text) });
    }

    if (action === "probe_drive") {


      const fileId = String(body.file_id ?? "");
      if (!fileId) return json({ error: "file_id is required" }, 400);
      const rows = Number(body.rows ?? 12);
      const bytes = await driveDownload(fileId);
      const wb = XLSX.read(bytes, { type: "array", cellDates: true });
      return json({
        sheets: wb.SheetNames.map((name) => ({
          name,
          rows: (
            XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
              header: 1,
              blankrows: false,
              raw: true,
            }) as unknown[][]
          ).slice(0, rows),
        })),
      });
    }

    if (action === "push_pack") {

      const runId = String(body.run_id ?? "");
      const parentFolderId = String(body.parent_folder_id ?? "");
      if (!runId || !parentFolderId) {
        return json({ error: "run_id and parent_folder_id are required" }, 400);
      }
      const { data: run, error } = await supabase
        .from("report_runs")
        .select("id, title, excel_path, draft_report_path, properties(name)")
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!run) return json({ error: "Run not found" }, 404);

      const folderName = String(
        body.folder_name ?? `${(run as { title?: string }).title ?? "Report"} — ROL'OS`,
      );
      const folderId = await driveFolder(folderName, parentFolderId);

      const targets = [
        { path: (run as { excel_path?: string | null }).excel_path, suffix: ".xlsx" },
        { path: (run as { draft_report_path?: string | null }).draft_report_path, suffix: ".html" },
      ].filter((t) => Boolean(t.path)) as { path: string; suffix: string }[];

      const uploaded: { name: string; id?: string; error?: string }[] = [];
      for (const target of targets) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(target.path);
          if (dlErr || !blob) throw dlErr ?? new Error("Missing stored file");
          const name = target.path.split("/").pop() ?? `report${target.suffix}`;
          const id = await driveUpload(
            name,
            folderId,
            new Uint8Array(await blob.arrayBuffer()),
            mimeFor(name),
          );
          uploaded.push({ name, id });
        } catch (err) {
          uploaded.push({
            name: target.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return json({ folder_id: folderId, uploaded });
    }

    /** Returns a run's generated report document, for printing it to PDF. */
    if (action === "report_html") {
      const runId = String(body.run_id ?? "");
      if (!runId) return json({ error: "run_id is required" }, 400);
      const { data: run, error } = await supabase
        .from("report_runs")
        .select("id, as_of_date, cadence, title, draft_report_path, properties(name)")
        .eq("id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!run) return json({ error: "Run not found" }, 404);
      const path = (run as { draft_report_path?: string | null }).draft_report_path;
      if (!path) return json({ error: "This run has no generated report yet" }, 409);
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
      if (dlErr || !blob) throw dlErr ?? new Error("Missing stored report");
      return json({
        run_id: runId,
        property_name: (run as { properties?: { name?: string } }).properties?.name ?? "",
        as_of_date: (run as { as_of_date?: string }).as_of_date ?? null,
        cadence: (run as { cadence?: string }).cadence ?? null,
        html: await blob.text(),
      });
    }

    /** Saves one printed PDF into a single (shared) Drive folder. */
    if (action === "push_pdf") {
      const parentFolderId = String(body.parent_folder_id ?? "");
      const folderName = String(body.folder_name ?? "");
      const fileName = String(body.file_name ?? "");
      const contentBase64 = String(body.content_base64 ?? "");
      if (!parentFolderId || !folderName || !fileName || !contentBase64) {
        return json(
          { error: "parent_folder_id, folder_name, file_name and content_base64 are required" },
          400,
        );
      }
      const folderId = await driveFolder(folderName, parentFolderId);
      const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
      const id = await driveUpload(fileName, folderId, bytes, "application/pdf");
      return json({ folder_id: folderId, file_id: id, name: fileName });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("reports-drive-runner failed:", message);
    return json({ error: message }, 500);
  }
});
