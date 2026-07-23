/**
 * ROL'OS Booking Widget — Gutenberg Block
 * Renders an iframe-based booking engine in the block editor and frontend.
 */

declare const wp: any;
declare const rolosBlocksConfig: {
  propertyId: string;
  brandColor: string;
  publicDomain: string;
};

export function registerBookingWidgetBlock() {
  const { registerBlockType } = wp.blocks;
  const { InspectorControls, useBlockProps } = wp.blockEditor;
  const { PanelBody, TextControl, SelectControl } = wp.components;
  const { createElement: h, useState } = wp.element;

  registerBlockType("rolos/booking-widget", {
    title: "ROL'OS Booking Widget",
    description: "Embed the ROL'OS booking engine with availability, rates, and checkout.",
    category: "embed",
    icon: "calendar-alt",
    keywords: ["booking", "hotel", "reservation", "rolos"],
    attributes: {
      propertyId: { type: "string", default: rolosBlocksConfig?.propertyId || "" },
      propertySlug: { type: "string", default: "" },
      brandColor: { type: "string", default: rolosBlocksConfig?.brandColor || "#e91e63" },
      height: { type: "string", default: "520px" },
    },

    edit: (props: any) => {
      const { attributes, setAttributes } = props;
      const blockProps = useBlockProps();
      const domain = rolosBlocksConfig?.publicDomain || "https://sleepinafrica.roomsonline.co.za";

      const iframeSrc = attributes.propertySlug
        ? `${domain}/embed/property/${attributes.propertySlug}?integration=wordpress&property_id=${attributes.propertyId}&brand_color=${encodeURIComponent(attributes.brandColor)}&mode=embedded`
        : "";

      return h(
        "div",
        blockProps,
        h(
          InspectorControls,
          null,
          h(
            PanelBody,
            { title: "Booking Widget Settings", initialOpen: true },
            h(TextControl, {
              label: "Property Slug",
              value: attributes.propertySlug,
              onChange: (val: string) => setAttributes({ propertySlug: val }),
              help: "The URL slug of your property (e.g. 'ocean-view-lodge')",
            }),
            h(TextControl, {
              label: "Property ID",
              value: attributes.propertyId,
              onChange: (val: string) => setAttributes({ propertyId: val }),
            }),
            h(TextControl, {
              label: "Brand Color",
              value: attributes.brandColor,
              onChange: (val: string) => setAttributes({ brandColor: val }),
              help: "Hex color for buttons and accents",
            }),
            h(SelectControl, {
              label: "Widget Height",
              value: attributes.height,
              options: [
                { label: "Compact (420px)", value: "420px" },
                { label: "Standard (520px)", value: "520px" },
                { label: "Tall (650px)", value: "650px" },
                { label: "Full (800px)", value: "800px" },
              ],
              onChange: (val: string) => setAttributes({ height: val }),
            })
          )
        ),
        iframeSrc
          ? h("iframe", {
              src: iframeSrc,
              style: {
                width: "100%",
                height: attributes.height,
                border: "none",
                borderRadius: "8px",
              },
              title: "ROL'OS Booking Widget",
            })
          : h(
              "div",
              {
                style: {
                  padding: "40px 20px",
                  textAlign: "center",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "2px dashed #d1d5db",
                },
              },
              h("p", { style: { fontSize: "16px", fontWeight: 600, margin: "0 0 8px" } }, "🏨 ROL'OS Booking Widget"),
              h("p", { style: { color: "#6b7280", margin: 0 } }, "Enter a Property Slug in the block settings to preview the booking engine.")
            )
      );
    },

    save: (props: any) => {
      const { attributes } = props;
      const domain = rolosBlocksConfig?.publicDomain || "https://sleepinafrica.roomsonline.co.za";
      const src = `${domain}/embed/property/${attributes.propertySlug}?integration=wordpress&property_id=${attributes.propertyId}&brand_color=${encodeURIComponent(attributes.brandColor)}&mode=embedded`;

      return wp.element.createElement("div", { className: "rolos-booking-widget" },
        wp.element.createElement("iframe", {
          src,
          style: `width:100%;height:${attributes.height};border:none;border-radius:8px;`,
          title: "Book Now",
          loading: "lazy",
          allow: "payment",
        })
      );
    },
  });
}
