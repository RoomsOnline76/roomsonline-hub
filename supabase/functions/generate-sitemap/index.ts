import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
};

const BASE_URL = "https://book.sleepinafrica.roomsonline.co.za";
const CONNECT_URL = "https://connect.roomsonline.co.za";
const TODAY = new Date().toISOString().split("T")[0];

const STATIC_PAGES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/property_listing", changefreq: "daily", priority: "0.9" },
  { loc: "/journals", changefreq: "weekly", priority: "0.8" },
  { loc: "/how-our-booking-engine-works", changefreq: "monthly", priority: "0.8" },
  { loc: "/about", changefreq: "monthly", priority: "0.7" },
  { loc: "/contact", changefreq: "monthly", priority: "0.6" },
  { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { loc: "/terms-of-service", changefreq: "yearly", priority: "0.3" },
  { loc: "/llms.txt", changefreq: "monthly", priority: "0.2" },
];

const CONNECT_PAGES = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/features", changefreq: "monthly", priority: "0.8" },
  { loc: "/integrations", changefreq: "monthly", priority: "0.7" },
  { loc: "/pricing", changefreq: "monthly", priority: "0.8" },
  { loc: "/docs", changefreq: "weekly", priority: "0.9" },
  { loc: "/docs/quickstart", changefreq: "monthly", priority: "0.7" },
  { loc: "/docs/wordpress", changefreq: "monthly", priority: "0.6" },
  { loc: "/faq", changefreq: "monthly", priority: "0.6" },
  { loc: "/about", changefreq: "monthly", priority: "0.5" },
  { loc: "/get-started", changefreq: "monthly", priority: "0.8" },
  { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { loc: "/terms-of-service", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch active properties
    const { data: properties } = await supabase
      .from("properties")
      .select("slug, updated_at, name, images")
      .eq("is_active", true)
      .is("permanently_deleted_at", null)
      .order("updated_at", { ascending: false });

    // Fetch published journals
    const { data: journals } = await supabase
      .from("journals")
      .select("slug, updated_at, title, header_image_url")
      .eq("status", "published")
      .order("publish_date", { ascending: false });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

    // Static booking pages
    for (const page of STATIC_PAGES) {
      xml += `  <url>
    <loc>${escapeXml(BASE_URL + page.loc)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }

    // Connect portal pages
    for (const page of CONNECT_PAGES) {
      xml += `  <url>
    <loc>${escapeXml(CONNECT_URL + page.loc)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }

    // Dynamic property pages
    if (properties) {
      for (const prop of properties) {
        if (!prop.slug) continue;
        const lastmod = prop.updated_at ? prop.updated_at.split("T")[0] : TODAY;
        const images = Array.isArray(prop.images) ? prop.images : [];
        const firstImage = typeof images[0] === "string" ? images[0] : (images[0] as any)?.url;

        xml += `  <url>
    <loc>${escapeXml(BASE_URL + "/property/" + prop.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>`;

        if (firstImage) {
          xml += `
    <image:image>
      <image:loc>${escapeXml(firstImage)}</image:loc>
      <image:title>${escapeXml(prop.name || prop.slug)}</image:title>
    </image:image>`;
        }
        xml += `
  </url>
`;
      }
    }

    // Dynamic journal pages
    if (journals) {
      for (const journal of journals) {
        if (!journal.slug) continue;
        const lastmod = journal.updated_at ? journal.updated_at.split("T")[0] : TODAY;
        xml += `  <url>
    <loc>${escapeXml(BASE_URL + "/journals#" + journal.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>`;

        if (journal.header_image_url) {
          xml += `
    <image:image>
      <image:loc>${escapeXml(journal.header_image_url)}</image:loc>
      <image:title>${escapeXml(journal.title || "")}</image:title>
    </image:image>`;
        }
        xml += `
  </url>
`;
      }
    }

    xml += `</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Error generating sitemap", { status: 500, headers: corsHeaders });
  }
});
