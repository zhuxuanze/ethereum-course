# Final course deliverables

The editable deliverables are generated from `report-content.json`, `presentation-content.json`, the recorded contract evidence, and `delivery-facts.json`. The latter records verified browser and publication status; an absent or unverified field is rendered as pending rather than assumed complete.

- `build_documents.py` creates the English report and the English/Chinese demonstration guide using `python-docx`.
- `build_presentation.mjs` creates twelve native, editable slides using `@oai/artifact-tool`. Tables, diagrams, text, and the gas chart remain editable. The application screenshot is a raster image of the actual interface.
- Every slide includes English speaker notes, Chinese translation, demonstration actions, and source information.
- Names, contribution statements, and any required signatures must be supplied by the actual team members.

## Rebuilding in the current Codex workspace

Use the bundled Python and Node runtimes identified by Codex's `load_workspace_dependencies` tool. The presentation builder imports the installed presentation validation utilities and expects `RUNTIME_NODE_MODULES` to identify the bundled modules. It currently records these workspace runtime locations explicitly. To reproduce the presentation outside this workspace, install the equivalent authoring runtime and update those paths; they are not dependencies of the treasury application.

Run `build_documents.py` with the bundled Python. Run `build_presentation.mjs` with the bundled Node and a new `DECK_REVISION` value, for example `v3`; finalization retains previous revisions rather than overwriting them. Generated artifacts are written to `output/final/community-treasury/`. Temporary renders and validation records are retained in `tmp/final-treasury-docs/`.

After content or evidence changes, regenerate the artifacts, render every DOCX page and PPTX slide with the bundled LibreOffice, and visually inspect all pages. Native package validation does not replace visual inspection. The recorded compatibility check uses LibreOffice and first-party presentation import; it does not claim Microsoft PowerPoint or WPS testing.

## Evidence boundaries

Local contract tests and browser sandbox checks are distinct from a hosted frontend and from a contract deployment on an external blockchain. The report and presentation must preserve that distinction. Single-run gas observations are gas units from receipts, not prices or performance averages. The project applies an established multisignature design and is not an independently audited custody product.
