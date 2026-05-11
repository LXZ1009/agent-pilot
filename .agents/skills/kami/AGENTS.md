# Kami Agent Guide

## Project

Kami is a document-generation skill and template system. It ships editorial HTML templates, reference guides, demo assets, and a packaged skill archive.

## Repository Map

- `SKILL.md` - skill routing and operating rules.
- `CHEATSHEET.md` - quick design reference.
- `CLAUDE.md` - Claude-specific notes pointing to AGENTS.md.
- `references/` - design, writing, diagram, and production guidance.
- `references/design.md`, `writing.md`, `production.md`, `diagrams.md` - full specs.
- `references/resume-writing.md` - resume-specific bullet/project framing rules.
- `references/anti-patterns.md` - six-category checklist for reviewing drafts.
- `references/tokens.json` and `references/stabilizer_profiles.json` - canonical tokens and HTML stabilization profiles.
- `references/brand-profile.md` and `references/brand.example.md` - optional brand profile behavior and public example.
- `.claude-plugin/marketplace.json` - Claude Code plugin marketplace metadata.
- `assets/templates/` - document templates.
- `assets/demos/` - README showcase demos.
- `assets/diagrams/` - diagram prototypes and generated diagram assets.
- `assets/fonts/` and `assets/illustrations/` - bundled visual assets.
- `styles.css` - shared web-facing styles.
- `index.html`, `index-zh.html`, `index-en.html`, `index-ja.html` - public site entrypoints.
- `robots.txt`, `sitemap.xml`, and `vercel.json` - public crawler, deployment, and AI visibility files.
- `llms.txt` - AI crawler and model-facing project summary.
- `scripts/build.py` - PDF, PNG, PPTX, and verification workflow.
- `scripts/shared.py` - shared constants and the canonical `HTML_TEMPLATES` registry used by build and stabilize scripts.
- `scripts/ensure-fonts.sh` - verified font recovery helper (portable across bash 3.2+).
- `scripts/stabilize.py` - deterministic HTML template normalization and overflow solving.
- `scripts/package-skill.sh` - package builder for the release archive.
- `scripts/draft-release-notes.py` - bilingual release notes scaffold from `git log`.
- `scripts/tests/test_build.py` - zero-dependency test suite for build, stabilize, and shared helpers.
- `.github/workflows/check.yml` - PR/push CI that runs `--check` and the test suite.
- `.github/workflows/release.yml` - tag-triggered workflow that builds and attaches `dist/kami.zip` to the release.
- `dist/kami.zip` - tracked release archive.

Reference docs are English-only. Language-specific output differences belong in templates, not duplicated reference files.

## Commands

```bash
python3 scripts/build.py
python3 scripts/build.py --check
python3 scripts/build.py --verify
python3 scripts/build.py --check-placeholders path/to/filled.html
python3 scripts/build.py --check-orphans path/to/doc.pdf
python3 scripts/build.py --check-density path/to/doc.pdf
python3 scripts/build.py --check-rhythm slides slides-en
python3 scripts/stabilize.py all --report
python3 scripts/stabilize.py one-pager --write --strict --report
python3 scripts/tests/test_build.py
python3 scripts/draft-release-notes.py V1.4.0..HEAD --version V1.4.1 --title "Steadier Hand"
bash scripts/ensure-fonts.sh
bash scripts/package-skill.sh
```

## Working Rules

- Style changes must update `references/design.md` and the matching template tokens.
- Content changes should avoid CSS churn unless layout behavior is part of the task.
- New templates should copy the nearest existing template, stay aligned with `references/design.md`, and add demo coverage.
- Stabilizer changes should update `references/stabilizer_profiles.json` with deterministic, target-specific rules rather than hard-coded one-off behavior.
- Do not use graphic emoticons in docs, template comments, or script output.
- Use `OK:` and `ERROR:` for status text in scripts.
- Use `scripts/ensure-fonts.sh` to recover required fonts with retry and size validation when local font files are missing or truncated.
- Do not bundle large commercial font files into `dist/kami.zip`; package scripts should exclude them while templates keep stable local-preview paths.
- Keep multilingual public pages, `llms.txt`, `robots.txt`, sitemap, JSON-LD, and FAQ content aligned when changing public positioning or install instructions.
- Brand profile support is optional context. Keep public examples in `references/`; do not hard-code a maintainer's private local profile content.
- Slides default to WeasyPrint HTML-to-PDF templates unless the user explicitly needs editable PPTX output.
- Templates intentionally inline their CSS rather than share a `_kami.css` partial: each template must remain a single self-contained HTML file so users can copy-paste it without a build step. When fixing CSS drift, apply the same change across affected templates rather than introducing a build-time include.
- The canonical `HTML_TEMPLATES` registry lives in `scripts/shared.py`; `build.py` and `stabilize.py` derive their target dicts from it. Update the registry, not the per-script dicts, when adding or removing templates.

## Current Risk Areas

- WeasyPrint rendering is sensitive to font availability, solid hex tag backgrounds, page breaks, CJK fallback, and synthetic bold. Verify visually for template changes.
- Slide output has two paths: `slides-weasy*.html` for default PDF decks and `slides*.py` for editable PPTX fallback.
- AI/public visibility spans `index*.html`, `llms.txt`, `robots.txt`, `sitemap.xml`, FAQ JSON-LD, README install text, diagram counts, and release archive links.
- `scripts/shared.py` centralizes constants used by build and stabilization scripts; keep paths and target names in sync before adding templates or diagrams.
- `dist/kami.zip` is a tracked release archive. Packaging changes must update and inspect it deliberately.
- `stabilize.py` only targets templates with `stabilize_max_pages > 0` in `HTML_TEMPLATES`. The `slides-weasy`, `equity-report`, and `changelog` templates are intentionally excluded: the overflow solver is not appropriate for multi-page decks or paginated reports.

## Verification Details

- Expected page counts: one-pager 1, letter 1, resume 2 strict, long-doc 7 plus or minus 2, portfolio 6 plus or minus 2, slides 7 plus or minus 3, equity-report 2 to 3, changelog 1 to 2.
- `scripts/build.py` sets PDF `/Author` from `git config user.name` or `KAMI_AUTHOR` only when the template still has an author placeholder. `/Producer` and `/Creator` should remain `Kami`.
- Demo PNGs under `assets/demos/` are first-page previews at 1241x1754px. For slide demos, capture the first two landscape pages, stack them with a parchment gap, then extend to 1241x1754px.
- Diagram count and names must stay aligned across `SKILL.md`, `CHEATSHEET.md`, `README.md`, `index*.html`, and `assets/diagrams/`.

## Verification

- Template, CSS, or script changes: run `python3 scripts/build.py --check` and `python3 scripts/build.py --verify`.
- HTML stabilization changes: run `python3 scripts/stabilize.py all --report` and inspect generated files under `dist/stabilized/` or the requested output directory.
- Demo changes: regenerate the affected demo outputs and confirm page counts stay in range.
- Font issues: run `bash scripts/ensure-fonts.sh`, then rebuild the affected target.
- Slide rhythm or deck changes: run `python3 scripts/build.py --check-rhythm slides slides-en` plus the affected render command.
- Public site or AI visibility changes: check `index*.html`, `llms.txt`, `robots.txt`, `sitemap.xml`, and README links together.
- Packaging changes: run `bash scripts/package-skill.sh` and confirm `dist/kami.zip` stays small enough for release upload.
- Documentation-only changes: check links and references.

## Release Notes

For public releases, keep notes concise and bilingual when requested. Use one-to-one English and Chinese changelog items, 5 to 8 items, one sentence each.

## Release Flow

- `bash scripts/package-skill.sh` writes the tracked `dist/kami.zip` release archive and excludes large TsangerJinKai font files.
- `dist/kami.zip` should be committed with release changes and uploaded to the latest GitHub release asset when refreshing the Claude Desktop package.
- README and public site download links use `https://github.com/tw93/kami/releases/latest/download/kami.zip`; prefer refreshing that asset for small packaging or documentation fixes instead of creating a new tag.
- Create a new version tag only when the maintainer explicitly wants a versioned release.

## Fonts

- Chinese templates use TsangerJinKai02 W04/W05. Commercial use requires the appropriate font license.
- If TsangerJinKai is unavailable, fall back through Source Han Serif SC, Noto Serif CJK SC, Songti SC, STSong, then Georgia.
- English templates use Charter serif. Japanese output uses YuMincho first, then Hiragino Mincho ProN, Noto Serif CJK JP, Source Han Serif JP, TsangerJinKai02, and generic serif.
- Claude Desktop ZIPs do not bundle TsangerJinKai TTF files. Run `bash scripts/ensure-fonts.sh` before building Chinese documents when fonts are missing.
