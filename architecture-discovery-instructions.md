# Instructions: Generate Architecture Overview Document

Please review the entire project codebase and produce a detailed Markdown document named `architecture-overview.md`. Be as concrete as possible throughout — use real file names, real paths, real function/class names. Avoid generic or abstract descriptions.

The document should cover the following sections:

## 1. General Structure
- A folder tree of the main project structure (2–3 levels deep), with a short description of what each folder is responsible for.
- Full technology stack: languages, frameworks, libraries (frontend, backend, database), and build/deploy tooling.

## 2. Existing Modules
Go through each module one by one. For each, describe: what it does, which files implement it, and how it connects to other modules.

- Registration / login module
- Authentication module (including: how identity documents, phone numbers, etc. are verified)
- User profile module (IDUP or equivalent)
- Matching module (between buyers and sellers / AOMs)
- Transaction processing module
- Any other existing module not listed above

## 3. Blockchain — Most Important Section
- Is there currently any blockchain implementation in the code (real, mock, placeholder, or none at all)?
- If yes: which network/SDK is used, where is the code located, how is it read from / written to, and what data is currently stored there.
- If no: where in the system is there a "hook" or a prepared integration point where blockchain functionality is meant to be connected in the future (e.g., API calls that currently simulate or stub something)?

## 4. Data Flow
- A text/ASCII diagram showing how a user moves through the system: registration → interview/profile creation → matching → AOM presentation → negotiation → transaction closing.
- Which API endpoints/routes currently exist for each step.

## 5. Gaps and TODOs
- Anything described in the patent document but not yet implemented in the actual code.
- Any TODO / FIXME comments or notes in the code relevant to the architecture.

## Output
Save the result as `architecture-overview.md` in the project root (or a `/docs` folder if one exists). Make sure it reflects the actual current state of the code, not the intended design from the patent — the goal is to identify exactly what exists today versus what is still missing.
