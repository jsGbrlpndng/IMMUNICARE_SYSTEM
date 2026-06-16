# ERD Export Instructions

Use these instructions to export the modular IMMUNICARE ERDs for Chapter 3.

## Export With Mermaid Live Editor

1. Open Mermaid Live Editor: `https://mermaid.live/`
2. Open one `.mmd` file from `docs/erd_mermaid/`.
3. Copy the full Mermaid code, including the `%%{init: ... }%%` header.
4. Paste it into the Mermaid Live Editor code panel.
5. Wait for the diagram preview to render.
6. Export as SVG for the clearest print quality, or PNG if your document editor handles PNG better.
7. Repeat for each of the eight modular ERD files.

## Recommended Export Settings

- Preferred format: SVG
- Alternate format: PNG
- Recommended PNG width: 2200 px or higher
- Recommended background: white
- Recommended placement: one figure per module subsection in Chapter 3
- Avoid shrinking diagrams too much; keep table text readable in the final manuscript.

## Documentation Guidance

Use the full ERD only as an overview figure because the complete database is too large to read comfortably in print. Use the eight modular ERDs as the main database documentation figures because each one focuses on a specific system module and shows only the most important keys/status fields.

When writing captions, mention whether relationships are enforced by foreign keys or only logical relationships. Do not draw logical-only relationships as normal enforced ERD lines.

PostGIS metadata tables such as `spatial_ref_sys`, `geometry_columns`, and `geography_columns` are excluded because they are extension-managed database infrastructure, not IMMUNICARE business entities.

