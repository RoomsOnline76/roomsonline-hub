import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 683;

/** Read image dimensions from binary header (JPEG SOF / PNG IHDR) without full decode */
function readDimensionsFromBuffer(buf: Uint8Array): { width: number; height: number } | null {
  // PNG: bytes 0-7 signature, IHDR at 8, width at 16, height at 20 (big-endian u32)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (buf.length < 24) return null;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }

  // JPEG: scan for SOF markers (0xFFC0-0xFFC3, 0xFFC5-0xFFC7, 0xFFC9-0xFFCB, 0xFFCD-0xFFCF)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const height = dv.getUint16(offset + 5);
        const width = dv.getUint16(offset + 7);
        return { width, height };
      }
      // Skip segment
      const segLen = (buf[offset + 2] << 8) | buf[offset + 3];
      offset += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF header, VP8 chunk
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    // VP8 lossy
    const vp8Offset = findSubarray(buf, [0x56, 0x50, 0x38, 0x20]);
    if (vp8Offset !== -1 && vp8Offset + 14 <= buf.length) {
      const w = ((buf[vp8Offset + 10] | (buf[vp8Offset + 11] << 8)) & 0x3fff);
      const h = ((buf[vp8Offset + 12] | (buf[vp8Offset + 13] << 8)) & 0x3fff);
      return { width: w, height: h };
    }
    // VP8L lossless
    const vp8lOffset = findSubarray(buf, [0x56, 0x50, 0x38, 0x4c]);
    if (vp8lOffset !== -1 && vp8lOffset + 9 <= buf.length) {
      const bits = (buf[vp8lOffset + 5] | (buf[vp8lOffset + 6] << 8) | (buf[vp8lOffset + 7] << 16) | (buf[vp8lOffset + 8] << 24)) >>> 0;
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      return { width: w, height: h };
    }
    // VP8X extended
    const vp8xOffset = findSubarray(buf, [0x56, 0x50, 0x38, 0x58]);
    if (vp8xOffset !== -1 && vp8xOffset + 14 <= buf.length) {
      const w = 1 + (buf[vp8xOffset + 8] | (buf[vp8xOffset + 9] << 8) | (buf[vp8xOffset + 10] << 16));
      const h = 1 + (buf[vp8xOffset + 11] | (buf[vp8xOffset + 12] << 8) | (buf[vp8xOffset + 13] << 16));
      return { width: w, height: h };
    }
  }

  return null;
}

function findSubarray(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i < haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i + needle.length;
  }
  return -1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional: filter by property_id or slug
    const url = new URL(req.url);
    const filterPropertyId = url.searchParams.get("property_id");

    let query = supabase.from("properties").select("id, name, images, amenities");
    if (filterPropertyId) {
      query = query.eq("id", filterPropertyId);
    }
    const { data: properties, error: propErr } = await query;

    if (propErr) throw propErr;

    const report: { property: string; file: string; width: number; height: number; action: string }[] = [];
    let deletedCount = 0;

    console.log(`Processing ${(properties || []).length} properties...`);
      const images: string[] = Array.isArray(prop.images) ? prop.images : [];
      const roomTypes: any[] = prop.amenities?.room_types || [];

      // Check property-level images
      const validPropertyImages: string[] = [];
      for (const url of images) {
        const result = await checkAndReport(supabase, url, prop.name || prop.id);
        if (result.undersized) {
          report.push({ property: prop.name || prop.id, file: result.path, width: result.width, height: result.height, action: "deleted" });
          deletedCount++;
        } else {
          validPropertyImages.push(url);
        }
      }

      // Check room-type images
      let roomsModified = false;
      for (const rt of roomTypes) {
        if (!Array.isArray(rt.images)) continue;
        const validRoomImages: string[] = [];
        for (const url of rt.images) {
          const result = await checkAndReport(supabase, url, `${prop.name}/${rt.name}`);
          if (result.undersized) {
            report.push({ property: prop.name || prop.id, file: result.path, width: result.width, height: result.height, action: "deleted" });
            deletedCount++;
          } else {
            validRoomImages.push(url);
          }
        }
        if (validRoomImages.length !== rt.images.length) {
          rt.images = validRoomImages;
          roomsModified = true;
        }
      }

      // Update property if images changed
      const propImagesChanged = validPropertyImages.length !== images.length;
      if (propImagesChanged || roomsModified) {
        const updatePayload: any = {};
        if (propImagesChanged) updatePayload.images = validPropertyImages;
        if (roomsModified) updatePayload.amenities = { ...prop.amenities, room_types: roomTypes };
        
        await supabase.from("properties").update(updatePayload).eq("id", prop.id);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      total_deleted: deletedCount, 
      report 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function checkAndReport(
  supabase: any,
  url: string,
  context: string
): Promise<{ undersized: boolean; path: string; width: number; height: number }> {
  // Extract storage path from URL
  const match = url.match(/property-images\/(.+)$/);
  const path = match ? match[1] : url;

  try {
    // Download the first 64KB to read headers
    const resp = await fetch(url, { headers: { Range: "bytes=0-65535" } });
    if (!resp.ok) return { undersized: false, path, width: 0, height: 0 }; // skip broken URLs

    const buf = new Uint8Array(await resp.arrayBuffer());
    const dims = readDimensionsFromBuffer(buf);
    
    if (!dims) return { undersized: false, path, width: 0, height: 0 }; // can't read = skip

    if (dims.width < MIN_WIDTH || dims.height < MIN_HEIGHT) {
      // Delete from storage
      if (match) {
        await supabase.storage.from("property-images").remove([decodeURIComponent(match[1])]);
      }
      return { undersized: true, path, width: dims.width, height: dims.height };
    }

    return { undersized: false, path, width: dims.width, height: dims.height };
  } catch {
    return { undersized: false, path, width: 0, height: 0 };
  }
}
