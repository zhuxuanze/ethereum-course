# Final course deliverables

The editable deliverables are generated from `report-content.json`, `presentation-content.json`, the recorded contract evidence, and `delivery-facts.json`. The latter records verified browser and publication status; an absent or unverified field is rendered as pending rather than assumed complete.

- `build_documents.py` creates the English report and the English/Chinese demonstration guide using `python-docx`.
- `build_presentation.mjs` creates twelve native, editable slides using `@oai/artifact-tool`. Tables, diagrams, text, and the gas chart remain editable. The application screenshot is a raster image of the actual interface.
- Every slide includes English speaker notes, Chinese translation, demonstration actions, and source information.
- Names, contribution statements, and any required signatures must be supplied by the actual team members.

## Rebuilding the deliverables

The document and presentation builders require a compatible authoring environment, separate from the treasury application's runtime. Set `RUNTIME_NODE_MODULES` to its Node modules directory, `PRESENTATION_SKILL_ROOT` to the installed presentation utilities directory, and `AUTHORING_PYTHON` to its Python executable. These locations are supplied through environment variables rather than stored in the project.

Run `build_documents.py` with the bundled Python. Run `build_presentation.mjs` with the bundled Node and a new `DECK_REVISION` value, for example `v3`; finalization retains previous revisions rather than overwriting them. Generated artifacts are written to `output/final/community-treasury/`. Temporary renders and validation records are retained in `tmp/final-treasury-docs/`.

After content or evidence changes, regenerate the artifacts, render every DOCX page and PPTX slide with the bundled LibreOffice, and visually inspect all pages. Native package validation does not replace visual inspection. The recorded compatibility check uses LibreOffice and first-party presentation import; it does not claim Microsoft PowerPoint or WPS testing.

## Evidence boundaries

Local contract tests and browser sandbox checks are distinct from a hosted frontend and from a contract deployment on an external blockchain. The report and presentation must preserve that distinction. Single-run gas observations are gas units from receipts, not prices or performance averages. The project applies an established multisignature design and is not an independently audited custody product.
