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
  /** Field-scoped delta provenance, inherited by every exchange of one push. */
  changed_fields?: string[] | null;
  push_type?: 'delta' | 'full' | null;
  fingerprint?: string | null;
}

/**
 * Why a row has no response body.
 *
 * Certification requires that an exchange with no response is *explained*: an auditor must be able
 * to tell "our own rate gate refused to send it" apart from "RU never answered". A row is only
 * allowed to be `completed` when a response body was actually received.
 */
export type RuTransportStatus =
  | 'completed'
  | 'rate_deferred'
  | 'transport_error'
  | 'timeout'
  | 'non_xml_response'
  | 'empty_response'
  | 'not_attempted';

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
  /** Explains a missing response. Derived when omitted. */
  transport_status?: RuTransportStatus | null;
  /** Short machine label + human detail for anything other than `completed`. */
  error_reason?: string | null;
  /** Which PMS fields drove this push (static / availability / price deltas). */
  changed_fields?: string[] | null;
  /** `delta` = fingerprint-driven change push, `full` = scheduled full refresh. */
  push_type?: 'delta' | 'full' | null;
  /** The fingerprint that was compared to decide this push. */
  fingerprint?: string | null;
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

/**
 * Channel StatusIDs that mean "the channel accepted this".
 * 0 = success, 5 = partial success (per-range notifs, documented for Push_PutPrices_RQ).
 * Everything else is a refusal — "Property does not exist" (56), "You can only modify stay in
 * confirmed reservation" (106) and friends arrive over a perfectly healthy HTTP 200, so judging the
 * exchange by transport alone paints real refusals green in the monitor.
 */
const RU_ACCEPTED_STATUS_IDS = new Set(['0', '5']);

/** True when the channel answered with a refusal status, whatever the HTTP layer thought. */
function channelRefused(statusId: string | null): boolean {
  if (statusId === null) return false;
  return !RU_ACCEPTED_STATUS_IDS.has(String(statusId).trim());
}

const asText = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

/** True when the body we got back cannot be an RU XML envelope. */
function looksLikeXml(body: string): boolean {
  return /<\s*[A-Za-z?]/.test(body.trimStart());
}

/**
 * Decide `transport_status` / `error_reason` when the caller did not label the exchange itself.
 *
 * The invariant this enforces: a row is `completed` only when a response body arrived. Anything
 * else carries a label explaining WHY the response is missing, so an auditor never sees a silent
 * null.
 */
function classifyTransport(entry: RuApiLogEntry): { status: RuTransportStatus; reason: string | null } {
  if (entry.transport_status) {
    return { status: entry.transport_status, reason: entry.error_reason ?? entry.error_message ?? null };
  }

  const raw = entry.response_xml ?? '';
  const message = entry.error_message ?? '';

  if (raw.trim().length > 0) {
    if (!looksLikeXml(raw)) {
      return {
        status: 'non_xml_response',
        reason: entry.error_reason ?? `non_xml_body: channel answered with a non-XML body (${raw.trim().slice(0, 120)})`,
      };
    }
    return { status: 'completed', reason: entry.error_reason ?? (entry.success ? null : message || 'channel returned an error status') };
  }

  // No body at all — say why.
  if (/RU_RATE_DEFERRED|rate limit|sliding/i.test(message)) {
    return {
      status: 'rate_deferred',
      reason: entry.error_reason ?? 'channel_rate_limit: pre-flight rate gate refused the call; request was never sent',
    };
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return { status: 'timeout', reason: entry.error_reason ?? `timeout: ${message || 'no response within the request budget'}` };
  }
  if (entry.http_status && entry.http_status >= 200 && entry.http_status < 400) {
    return { status: 'empty_response', reason: entry.error_reason ?? `empty_response: HTTP ${entry.http_status} with an empty body` };
  }
  if (message) {
    return { status: 'transport_error', reason: entry.error_reason ?? `transport_error: ${message}` };
  }
  return { status: 'not_attempted', reason: entry.error_reason ?? 'not_attempted: the request was never sent to the channel' };
}

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
    const transport = classifyTransport(entry);
    const effectiveStatusId = entry.status_id ?? status.id;
    const refused = channelRefused(effectiveStatusId);
    // A refusal carried over HTTP 200 is still a failed exchange.
    const success = entry.success === true && !refused;
    const refusalReason = refused
      ? `channel_error: StatusID ${effectiveStatusId} — ${entry.status_message ?? status.message ?? 'the channel refused the request'}`
      : null;

    // supabase-js returns errors instead of throwing — surface them to the function console so a
    // silent logging outage (missing grant, schema drift) can never hide behind an empty table.
    const { error } = await supabase.from('ru_api_log').insert({
      trace_id: entry.trace_id ?? null,
      parent_action: entry.parent_action ?? null,
      // Inbound rows keep the classified event name; the RU verb inside the body would otherwise
      // overwrite it and make the trail unfilterable by action.
      action: entry.direction === 'inbound' ? entry.action : (extractRuVerb(entry.request_xml) ?? entry.action),
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
      transport_status: transport.status,
      error_reason: transport.status === 'completed' && entry.success ? null : transport.reason,
      changed_fields: entry.changed_fields && entry.changed_fields.length > 0 ? entry.changed_fields : null,
      push_type: entry.push_type ?? null,
      fingerprint: entry.fingerprint ?? null,
    });
    if (error) console.warn('[ruApiLog] insert rejected:', error.message, error.details ?? '');
  } catch (err) {
    console.warn('[ruApiLog] insert failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Record an exchange that never reached the channel (missing sub-account keys, master-auth refusal,
 * unresolved listing id, gate refusal). Certification needs these visible: a cancel that was never
 * attempted must not look like a cancel that silently succeeded.
 */
export async function logRuNotAttempted(
  supabase: any,
  entry: RuApiLogContext & {
    action: string;
    /** Machine label + detail, e.g. `no_subuser_keys: owner 741761 has no verified key pair`. */
    error_reason: string;
    error_message?: string | null;
    transport_status?: RuTransportStatus;
  },
): Promise<void> {
  await logRuExchange(supabase, {
    ...entry,
    success: false,
    request_xml: null,
    response_xml: null,
    http_status: null,
    transport_status: entry.transport_status ?? 'not_attempted',
    error_reason: entry.error_reason,
    error_message: entry.error_message ?? entry.error_reason,
  });
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
      .select('id, action, response_id, status_id, success, transport_status, error_reason, changed_fields, push_type, created_at')
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

/**
 * Record an INBOUND exchange: the channel posting a reservation notification to us.
 *
 * Certification and day-to-day support both need the two directions in one place — before this the
 * exchange log held outbound rows only, so an operator could see what we sent but never what the
 * channel actually said. The notification body is the "request" here; our answer is the response.
 */
export async function logRuInboundNotification(
  supabase: any,
  entry: RuApiLogContext & {
    /** Classified event, e.g. `RLNM_ReservationConfirmed`. */
    action: string;
    body_xml?: string | null;
    response_xml?: string | null;
    success: boolean;
    error_message?: string | null;
    error_reason?: string | null;
    ru_reservation_id?: string | null;
  },
): Promise<void> {
  await logRuExchange(supabase, {
    ...entry,
    action: entry.action,
    direction: 'inbound',
    endpoint: 'ru-reservation-handler',
    request_xml: entry.body_xml ?? null,
    response_xml: entry.response_xml ?? '<Response>OK</Response>',
    http_status: 200,
    success: entry.success,
    transport_status: entry.success ? 'completed' : undefined,
    error_reason: entry.error_reason ?? null,
    error_message: entry.error_message ?? null,
  });
}
