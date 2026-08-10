// Durable Rentals United request/response log.
//
// White-Label certification requires that any API exchange can be retrieved for a support case:
// the full request XML, the full response, and RU's `ResponseID`, retained for at least 30 days.
// Function console logs do not satisfy this (short retention, not queryable by ResponseID), so
// every exchange is persisted to `ru_api_log` instead.
//
// Rules:
//   - Credentials are ALWAYS redacted before storage.
//   - A log write must never break a push: all failures are swallowed and logged to console.
//   - Retention lives on the table (`expires_at` default) so it can be raised without a deploy.

/** Context a caller can attach so an exchange is traceable end-to-end. */
export interface RuApiLogContext {
  /** Correlates every exchange belonging to one logical operation (e.g. one property push). */
  trace_id?: string | null;
  /** The ROLOS operation that caused the call, e.g. `push-property-to-ru:static_only`. */
  parent_action?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
  ru_property_id?: string | number | null;
  ru_owner_id?: string | number | null;
  ru_user_id?: string | number | null;
}

export interface RuApiLogEntry extends RuApiLogContext {
  /** RU verb, e.g. `Push_PutProperty_RQ`. Falls back to the ROLOS action name. */
  action: string;
  endpoint?: string | null;
  direction?: 'outbound' | 'inbound';
  request_xml?: string | null;
  response_xml?: string | null;
  http_status?: number | null;
  success: boolean;
  elapsed_ms?: number | null;
  error_message?: string | null;
  /** Pre-extracted values; when omitted they are parsed from `response_xml`. */
  response_id?: string | null;
  status_id?: string | null;
  status_message?: string | null;
}

/** Strip credentials from anything that will be stored or shown to staff. */
export function redactRuXml(xml: string | null | undefined): string | null {
  if (!xml) return null;
  return xml
    .replace(/<AccessKey>[\s\S]*?<\/AccessKey>/gi, '<AccessKey>[REDACTED]</AccessKey>')
    .replace(/<SecretKey>[\s\S]*?<\/SecretKey>/gi, '<SecretKey>[REDACTED]</SecretKey>')
    .replace(/<Password>[\s\S]*?<\/Password>/gi, '<Password>[REDACTED]</Password>')
    .replace(/<UserName>[\s\S]*?<\/UserName>/gi, '<UserName>[REDACTED]</UserName>');
}

/** RU's support handle for an exchange. Present on most Push_* responses. */
export function extractResponseId(xml: string | null | undefined): string | null {
  if (!xml) return null;
  return xml.match(/<ResponseID>\s*([^<]+?)\s*<\/ResponseID>/i)?.[1] ?? null;
}

/** The RU verb that names the exchange, taken from the request envelope. */
export function extractRuVerb(xml: string | null | undefined): string | null {
  if (!xml) return null;
  return xml.match(/<\s*((?:Pull|Push|CM)_[A-Za-z0-9_]+)/)?.[1] ?? null;
}

function extractStatus(xml: string | null | undefined): { id: string | null; message: string | null } {
  if (!xml) return { id: null, message: null };
  const errorMatch = xml.match(/<error\s+ID="([^"]+)"[^>]*>([\s\S]*?)<\/error>/i);
  if (errorMatch) return { id: errorMatch[1], message: errorMatch[2]?.trim() || 'RU error' };
  return {
    id: xml.match(/<Status\s+ID="(\d+)"/)?.[1] ?? null,
    message: xml.match(/<Status[^>]*>([\s\S]*?)<\/Status>/)?.[1]?.trim() ?? null,
  };
}

const asText = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

/**
 * Persist one RU exchange. Never throws.
 *
 * `supabase` must be a service-role client: `ru_api_log` is staff-read-only and written only by
 * edge functions.
 */
export async function logRuExchange(supabase: any, entry: RuApiLogEntry): Promise<void> {
  try {
    const request_xml = redactRuXml(entry.request_xml);
    const response_xml = redactRuXml(entry.response_xml);
    const status = extractStatus(entry.response_xml);

    await supabase.from('ru_api_log').insert({
      trace_id: entry.trace_id ?? null,
      parent_action: entry.parent_action ?? null,
      action: extractRuVerb(entry.request_xml) ?? entry.action,
      endpoint: entry.endpoint ?? null,
      direction: entry.direction ?? 'outbound',
      property_id: entry.property_id ?? null,
      unit_id: entry.unit_id ?? null,
      ru_property_id: asText(entry.ru_property_id),
      ru_owner_id: asText(entry.ru_owner_id),
      ru_user_id: asText(entry.ru_user_id),
      request_xml,
      response_xml,
      request_bytes: request_xml ? request_xml.length : null,
      response_bytes: response_xml ? response_xml.length : null,
      response_id: entry.response_id ?? extractResponseId(entry.response_xml),
      status_id: entry.status_id ?? status.id,
      status_message: entry.status_message ?? status.message,
      http_status: entry.http_status ?? null,
      success: entry.success,
      elapsed_ms: entry.elapsed_ms ?? null,
      error_message: entry.error_message ?? null,
    });
  } catch (err) {
    console.warn('[ruApiLog] insert failed:', err instanceof Error ? err.message : err);
  }
}

/** Stable trace id for one logical operation. */
export function newRuTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Support linkage for a sync run: the exchanges this run produced.
 *
 * `ru_sync_runs` records outcomes; this returns the ids + ResponseIDs of the raw exchanges behind
 * them so run history in the console links straight to the evidence. Never throws.
 */
export async function summarizeRuExchanges(
  supabase: any,
  propertyId: string | null | undefined,
  sinceIso: string,
): Promise<Array<Record<string, unknown>>> {
  if (!propertyId) return [];
  try {
    const { data } = await supabase
      .from('ru_api_log')
      .select('id, action, response_id, status_id, success, created_at')
      .eq('property_id', propertyId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(200);
    return data ?? [];
  } catch (err) {
    console.warn('[ruApiLog] summarize failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
