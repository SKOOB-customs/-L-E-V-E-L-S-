# AGENTS.md

## Project overview
This repository is a small static website for Levels, focused on:
- lightweight feature submission
- JSON glitch skin input
- small website-friendly mod ideas
- Steam and Discord community links

The project should stay simple, compact, and easy to maintain. Prefer static HTML, CSS, and JavaScript over frameworks unless a request explicitly requires them.

## Brand and URL conventions
- Use the project name: Levels
- When referring to the page slug or URL naming, prefer a compact style similar to LeveLs to match the requested branding
- Keep naming consistent across the site and project docs
- Avoid adding large or noisy branding changes that break the minimal project direction

## Working conventions
- Keep pages lightweight and easy to read
- Favor brief, structured forms over complex flows
- For mod-related submissions, keep JSON examples minimal and readable
- Preserve a clean gaming-community aesthetic without heavy visual clutter
- Prefer small iterative additions over broad redesigns

## Local verification
Run the site locally from the project root with:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Files to check first
- README.md
- index.html
- styles.css
- script.js

## Guidance for AI agents
- Maintain the existing lightweight static-site structure
- Keep feature input forms compact and clear
- When adding or editing content, stay aligned with the Levels brand and small-scope mission
- Prefer community links that are simple and immediately visible, such as Steam and Discord CTAs
- Keep integration minimal: direct links, clean styling, and low-friction access for users
- Avoid unnecessary build tooling, framework setup, or overengineering
