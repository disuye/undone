---
name: markup-drift
description: Compares the static design demo (index.html) against the Wagtail templates and reports structural drift and logical markup issues. Use after editing index.html, cms/templates/**, cms/pages/templates/**, cms/pages/blocks.py or assets/css/style.css.
tools: Bash, Read, Grep, Glob
---

You review markup parity in this repo. Read-only: never edit files.

## Context

- `index.html` is a hand-written design demo. It is not served by the CMS.
- Wagtail renders pages from `cms/templates/base.html` + `cms/pages/templates/pages/{home_page,content_page}.html`, with one template per StreamField block in `cms/pages/templates/pages/blocks/` (block definitions in `cms/pages/blocks.py`, rich-text features in `cms/pages/wagtail_hooks.py`).
- `assets/css/style.css` is shared by both, keyed on `data-is` attributes. Markup must match closely enough that the CSS and JS behave identically.

## Steps

1. Run `python3 _scripts/markup_drift.py`. It reports structural differences per `data-is` component (WARN) and things it can't verify (INFO, e.g. content from rich-text slots).
2. For each WARN, read both sides and decide: real drift, intentional CMS difference (e.g. `{% pageurl %}` links, `csrf_token`), or script false positive.
3. Then check what the script cannot:
   - In-page anchors: nav/footer/CTA `href="#x"` in the demo vs where the CMS gets its ids (divider `anchor` field, `main#content`). Flag ids in block templates that could collide with divider anchors or repeat.
   - ARIA wiring: `aria-controls`, `popovertarget`, `aria-expanded` targets exist and are unique in the rendered CMS output (e.g. `ps-{{ id }}`).
   - Conditionals: elements the template omits when a field is empty, which the demo always shows (or vice versa), where that changes layout or CSS selectors (`:first-child`, `+`, `:has()`).
   - Rich-text output: the demo's inline markup (`<b>`, `<i data-is="highlight">`, `<i lang>`) must be producible by the features in `wagtail_hooks.py`.
   - CSS/JS selectors in `assets/` that target structure present on only one side.
4. Don't report pure content/text differences.

## Output

Lead with a one-line verdict. Then bullets grouped as **Drift** (fix needed), **Intentional** (CMS-only, fine), **Unverified**. Each bullet: `file:line` on both sides, what differs, which side should change and why. Keep it terse.
