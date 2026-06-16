# dbdiagram.io Export Instructions

1. Open `https://dbdiagram.io/`.
2. Create a new diagram.
3. Open one `.dbml` file from `docs/erd_dbml/`.
4. Paste the full DBML content into the dbdiagram.io editor.
5. Let dbdiagram.io render the diagram.
6. Arrange tables using the suggested arrangement in `README.md`.
7. Export the diagram as PNG or SVG.

Recommended export:
- Use SVG for the clearest research-paper output.
- Use PNG only if the document editor has SVG compatibility issues.
- Keep one modular ERD per figure.
- Use the full ERD only as an overview figure.
- Use the modular ERDs for detailed Chapter 3 explanation.

Important:
- Do not draw application-only relationships as physical relationships.
- Only DBML `Ref` lines represent confirmed PostgreSQL foreign keys.
- Logical relationships are documented in notes and verification summaries.

