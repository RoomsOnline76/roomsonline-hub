import { useEffect } from "react";

const SITE_NAME = "Sleep in Africa";
const BASE_URL = "https://book.sleepinafrica.roomsonline.co.za";

export interface PageSEOConfig {
  title: string;
  description: string;
  canonical?: string;
  ogType?: "website" | "article" | "place";
  ogImage?: string;
  jsonLd?: object | object[];
  breadcrumbs?: { name: string; url: string }[];
  noIndex?: boolean;
}

function upsertMeta(name: string, content: string, isProperty = false) {
  const attr = isProperty ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageSEO(config: PageSEOConfig) {
  useEffect(() => {
    // Title
    const prevTitle = document.title;
    document.title = config.title.includes(SITE_NAME)
      ? config.title
      : `${config.title} | ${SITE_NAME}`;

    // Meta description
    upsertMeta("description", config.description);

    // Robots
    if (config.noIndex) {
      upsertMeta("robots", "noindex, nofollow");
    } else {
      const robotsMeta = document.querySelector('meta[name="robots"]');
      if (robotsMeta) robotsMeta.remove();
    }

    // Canonical
    const canonical = config.canonical || `${BASE_URL}${window.location.pathname}`;
    upsertLink("canonical", canonical);

    // Open Graph
    upsertMeta("og:title", config.title, true);
    upsertMeta("og:description", config.description, true);
    upsertMeta("og:type", config.ogType || "website", true);
    upsertMeta("og:url", canonical, true);
    upsertMeta("og:site_name", SITE_NAME, true);
    if (config.ogImage) {
      upsertMeta("og:image", config.ogImage, true);
    }

    // Twitter
    upsertMeta("twitter:card", "summary_large_image", true);
    upsertMeta("twitter:title", config.title, true);
    upsertMeta("twitter:description", config.description, true);
    if (config.ogImage) {
      upsertMeta("twitter:image", config.ogImage, true);
    }

    // JSON-LD scripts
    const scriptIds: string[] = [];

    // Breadcrumb JSON-LD
    if (config.breadcrumbs && config.breadcrumbs.length > 0) {
      const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: config.breadcrumbs.map((bc, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: bc.name,
          item: bc.url.startsWith("http") ? bc.url : `${BASE_URL}${bc.url}`,
        })),
      };
      const id = "seo-breadcrumb-ld";
      injectJsonLd(id, breadcrumbLd);
      scriptIds.push(id);
    }

    // Custom JSON-LD
    const jsonLdItems = config.jsonLd
      ? Array.isArray(config.jsonLd) ? config.jsonLd : [config.jsonLd]
      : [];
    jsonLdItems.forEach((ld, i) => {
      const id = `seo-jsonld-${i}`;
      injectJsonLd(id, ld);
      scriptIds.push(id);
    });

    return () => {
      document.title = prevTitle;
      scriptIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  }, [config.title, config.description, config.canonical, config.ogType, config.ogImage, config.noIndex, config.jsonLd, config.breadcrumbs]);
}

function injectJsonLd(id: string, data: object) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.text = JSON.stringify(data);
}
