/**
 * ROL'OS Property Card — Gutenberg Block
 * Displays a single property card with image, name, rate, and booking link.
 */

declare const wp: any;
declare const rolosBlocksConfig: {
  propertyId: string;
  brandColor: string;
  publicDomain: string;
};

export function registerPropertyCardBlock() {
  const { registerBlockType } = wp.blocks;
  const { InspectorControls, useBlockProps } = wp.blockEditor;
  const { PanelBody, TextControl } = wp.components;
  const { createElement: h } = wp.element;

  registerBlockType("rolos/property-card", {
    title: "ROL'OS Property Card",
    description: "Display a single property with image, name, and booking button.",
    category: "widgets",
    icon: "admin-home",
    keywords: ["property", "card", "hotel", "rolos"],
    attributes: {
      propertySlug: { type: "string", default: "" },
      propertyId: { type: "string", default: rolosBlocksConfig?.propertyId || "" },
      title: { type: "string", default: "" },
      imageUrl: { type: "string", default: "" },
      rate: { type: "string", default: "" },
      brandColor: { type: "string", default: rolosBlocksConfig?.brandColor || "#e91e63" },
    },

    edit: (props: any) => {
      const { attributes, setAttributes } = props;
      const blockProps = useBlockProps();
      const domain = rolosBlocksConfig?.publicDomain || "https://sleepinafrica.roomsonline.co.za";

      return h(
        "div",
        blockProps,
        h(
          InspectorControls,
          null,
          h(
            PanelBody,
            { title: "Property Card Settings", initialOpen: true },
            h(TextControl, {
              label: "Property Title",
              value: attributes.title,
              onChange: (val: string) => setAttributes({ title: val }),
            }),
            h(TextControl, {
              label: "Property Slug",
              value: attributes.propertySlug,
              onChange: (val: string) => setAttributes({ propertySlug: val }),
            }),
            h(TextControl, {
              label: "Image URL",
              value: attributes.imageUrl,
              onChange: (val: string) => setAttributes({ imageUrl: val }),
            }),
            h(TextControl, {
              label: "Starting Rate (e.g. R1,200)",
              value: attributes.rate,
              onChange: (val: string) => setAttributes({ rate: val }),
            }),
            h(TextControl, {
              label: "Brand Color",
              value: attributes.brandColor,
              onChange: (val: string) => setAttributes({ brandColor: val }),
            })
          )
        ),
        // Card preview
        h(
          "div",
          {
            style: {
              maxWidth: "360px",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              background: "#fff",
            },
          },
          attributes.imageUrl
            ? h("img", {
                src: attributes.imageUrl,
                alt: attributes.title || "Property",
                style: { width: "100%", height: "200px", objectFit: "cover" },
              })
            : h("div", {
                style: { width: "100%", height: "200px", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" },
              }, "Property Image"),
          h(
            "div",
            { style: { padding: "16px" } },
            h("h3", { style: { margin: "0 0 8px", fontSize: "18px" } }, attributes.title || "Property Name"),
            attributes.rate && h("p", { style: { margin: "0 0 12px", color: "#6b7280", fontSize: "14px" } }, `From ${attributes.rate}/night`),
            h(
              "a",
              {
                href: `${domain}/embed/property/${attributes.propertySlug}`,
                style: {
                  display: "inline-block",
                  padding: "8px 20px",
                  background: attributes.brandColor,
                  color: "#fff",
                  borderRadius: "6px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                },
              },
              "Book Now"
            )
          )
        )
      );
    },

    save: (props: any) => {
      const { attributes } = props;
      const domain = rolosBlocksConfig?.publicDomain || "https://sleepinafrica.roomsonline.co.za";
      const bookingUrl = `${domain}/embed/property/${attributes.propertySlug}?integration=wordpress&property_id=${attributes.propertyId}&brand_color=${encodeURIComponent(attributes.brandColor)}&mode=embedded`;

      const el = wp.element.createElement;
      return el("div", { className: "rolos-property-card", style: "max-width:360px;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;" },
        attributes.imageUrl && el("img", { src: attributes.imageUrl, alt: attributes.title, style: "width:100%;height:200px;object-fit:cover;" }),
        el("div", { style: "padding:16px;" },
          el("h3", { style: "margin:0 0 8px;font-size:18px;" }, attributes.title),
          attributes.rate && el("p", { style: "margin:0 0 12px;color:#6b7280;font-size:14px;" }, `From ${attributes.rate}/night`),
          el("a", {
            href: bookingUrl,
            className: "rolos-book-btn",
            style: `display:inline-block;padding:8px 20px;background:${attributes.brandColor};color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;`,
          }, "Book Now")
        )
      );
    },
  });
}
