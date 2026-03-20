/**
 * ROL'OS Property Explorer — Gutenberg Block
 * Renders a filterable grid of properties from the rolos_property CPT.
 * Server-rendered via PHP shortcode fallback in save().
 */

declare const wp: any;
declare const rolosBlocksConfig: {
  propertyId: string;
  brandColor: string;
  publicDomain: string;
};

export function registerPropertyExplorerBlock() {
  const { registerBlockType } = wp.blocks;
  const { InspectorControls, useBlockProps } = wp.blockEditor;
  const { PanelBody, RangeControl, SelectControl, ToggleControl } = wp.components;
  const { createElement: h } = wp.element;

  registerBlockType("rolos/property-explorer", {
    title: "ROL'OS Property Explorer",
    description: "Display a filterable grid of your properties with images, rates, and booking links.",
    category: "widgets",
    icon: "grid-view",
    keywords: ["property", "grid", "hotel", "rolos", "listing"],
    attributes: {
      columns: { type: "number", default: 3 },
      limit: { type: "number", default: 12 },
      showFilter: { type: "boolean", default: true },
    },

    edit: (props: any) => {
      const { attributes, setAttributes } = props;
      const blockProps = useBlockProps();

      return h(
        "div",
        blockProps,
        h(
          InspectorControls,
          null,
          h(
            PanelBody,
            { title: "Grid Settings", initialOpen: true },
            h(RangeControl, {
              label: "Columns",
              value: attributes.columns,
              onChange: (val: number) => setAttributes({ columns: val }),
              min: 1,
              max: 4,
            }),
            h(RangeControl, {
              label: "Max Properties",
              value: attributes.limit,
              onChange: (val: number) => setAttributes({ limit: val }),
              min: 1,
              max: 24,
            }),
            h(ToggleControl, {
              label: "Show Filter Bar",
              checked: attributes.showFilter,
              onChange: (val: boolean) => setAttributes({ showFilter: val }),
            })
          )
        ),
        // Editor preview
        h(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: `repeat(${attributes.columns}, 1fr)`,
              gap: "16px",
              padding: "16px",
              background: "#f9fafb",
              borderRadius: "8px",
              border: "2px dashed #d1d5db",
            },
          },
          ...Array.from({ length: Math.min(attributes.limit, 6) }, (_, i) =>
            h(
              "div",
              {
                key: i,
                style: {
                  background: "#fff",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                },
              },
              h("div", {
                style: { height: "120px", background: "#e5e7eb" },
              }),
              h(
                "div",
                { style: { padding: "12px" } },
                h("div", {
                  style: { height: "14px", width: "70%", background: "#d1d5db", borderRadius: "4px", marginBottom: "8px" },
                }),
                h("div", {
                  style: { height: "10px", width: "50%", background: "#e5e7eb", borderRadius: "4px" },
                })
              )
            )
          )
        ),
        h(
          "p",
          { style: { textAlign: "center", color: "#6b7280", fontSize: "13px", marginTop: "8px" } },
          `ROL'OS Property Explorer — ${attributes.columns} columns, up to ${attributes.limit} properties`
        )
      );
    },

    // Server-rendered via shortcode
    save: (props: any) => {
      const { attributes } = props;
      return wp.element.createElement(wp.element.RawHTML, null,
        `[rolos_property_grid limit="${attributes.limit}" columns="${attributes.columns}"]`
      );
    },
  });
}
