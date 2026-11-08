#!/usr/bin/env node
/**
 * Bind docs/handbook into a single PDF.
 *
 *   node scripts/build-handbook-pdf.mjs --version 1.3.0 --out dist/handbook.pdf
 *
 * Chapter order comes from the numbered list in docs/handbook/README.md, which
 * is where the handbook already declares it — the README says inserting a
 * chapter must never mean renaming files, so the filenames carry no order and
 * this is the only place that knows it. A chapter written but not listed is
 * therefore left out on purpose, and the build says so rather than guessing.
 *
 * Markdown → HTML → PDF via headless Chrome, rather than pandoc + LaTeX: the
 * runner already has Chrome, it needs no TeX install, and the page can be
 * styled with the same CSS vocabulary as the rest of the project instead of
 * coming out looking like a paper.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HANDBOOK = join(ROOT, "docs", "handbook");

// ── Arguments ────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const version = arg("version", "dev");
const outPath = resolve(ROOT, arg("out", `dist-handbook/zakhira-handbook-v${version}.pdf`));
const keepHtml = process.argv.includes("--keep-html");

// ── Chapter order ────────────────────────────────────────────────────────────

/**
 * Pull the ordered chapter list out of the README.
 *
 * Only linked entries are chapters. An italic "not yet written" placeholder is
 * a deliberate gap in the book and is skipped — but counted, so the numbering
 * in the PDF matches the numbering in the README rather than silently closing
 * up and disagreeing with it.
 */
function readChapterList() {
  const readme = readFileSync(join(HANDBOOK, "README.md"), "utf8");
  const section = readme.split(/^## Chapters$/m)[1];
  if (!section) throw new Error("No '## Chapters' section in docs/handbook/README.md");

  const chapters = [];
  const missing = [];
  for (const line of section.split("\n")) {
    const item = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (!item) {
      // The list ends at the first blank-separated prose paragraph.
      if (chapters.length > 0 && line.trim() === "") break;
      continue;
    }
    const [, number, rest] = item;
    const link = /\[([^\]]+)\]\(([^)]+\.md)\)/.exec(rest);
    if (!link) {
      // "*Overview* — not yet written" → number 1, title "Overview". The
      // placeholder wording is the README's, not part of the chapter's name.
      const title = rest
        .replace(/[*_]/g, "")
        .replace(/\s*[—-]\s*not yet written\s*$/i, "")
        .trim();
      missing.push({ number: Number(number), title });
      continue;
    }
    chapters.push({ number: Number(number), title: link[1], file: link[2] });
  }

  if (chapters.length === 0) throw new Error("No linked chapters found in the README list");
  return { chapters, missing };
}

// ── Markdown → HTML ──────────────────────────────────────────────────────────

marked.setOptions({ gfm: true });

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Render one chapter, with its links and images made to work in a single
 * standalone file.
 *
 * Images become absolute file:// URLs because the generated HTML does not live
 * in docs/handbook, so the relative paths in the source would dangle. Links to
 * other chapters become in-document anchors; everything else is left alone.
 */
function renderChapter(chapter, byFile) {
  const md = readFileSync(join(HANDBOOK, chapter.file), "utf8");
  // Drop the chapter's own H1 — the PDF prints a numbered heading instead, so
  // keeping it would title every chapter twice.
  const body = md.replace(/^#\s+.*\n/, "");

  const renderer = new marked.Renderer();

  renderer.image = ({ href, title, text }) => {
    const abs = pathToFileURL(resolve(HANDBOOK, href)).href;
    const caption = text ? `<figcaption>${escapeHtml(text)}</figcaption>` : "";
    return `<figure><img src="${abs}"${title ? ` title="${escapeHtml(title)}"` : ""}>${caption}</figure>`;
  };

  renderer.link = ({ href, title, tokens }) => {
    const text = this?.parser?.parseInline?.(tokens) ?? tokens.map((t) => t.raw ?? "").join("");
    const target = byFile.has(href.split("#")[0])
      ? `#ch-${byFile.get(href.split("#")[0]).number}`
      : href;
    return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${text}</a>`;
  };

  return marked.parse(body, { renderer });
}

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * Print styling.
 *
 * The explicit image cap is the load-bearing rule: the handbook's screenshots
 * are tall phone captures, and at their natural size each one takes a whole
 * page and pushes its caption onto the next.
 */
const CSS = `
  @page { size: A4; margin: 18mm 16mm 16mm; }

  :root {
    --ink: #16181d;      --muted: #5b6069;    --faint: #8b9099;
    --rule: #d9dce1;     --accent: #8a6a1f;   --panel: #f6f6f4;
  }

  * { box-sizing: border-box; }

  /*
   * The symbol and emoji families are a safety net, not a fix for anything
   * currently broken: the handbook avoids pictographic glyphs by preference,
   * and today only uses → and ›, which every font has.
   *
   * They stay because the build runs on two very different machines — macOS,
   * where Apple's fonts cover almost any mark, and a bare Linux runner, where
   * they do not exist. Without this, a glyph that creeps into the prose would
   * look right to whoever proofread it locally and print as a box for
   * everyone else, with nothing failing to say so.
   */
  body {
    margin: 0; color: var(--ink); background: #fff;
    font: 10.5pt/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial,
          "Apple Symbols", "Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans",
          "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Cover */
  .cover { height: 247mm; display: flex; flex-direction: column; justify-content: center; }
  .cover h1 { font-size: 40pt; margin: 0; letter-spacing: -0.5pt; }
  .cover .sub { font-size: 14pt; color: var(--muted); margin-top: 6pt; }
  .cover .meta { margin-top: 28pt; font-size: 10pt; color: var(--faint); }
  .cover .rule { width: 56pt; height: 3pt; background: var(--accent); margin: 18pt 0; }

  /* Contents */
  .toc { break-before: page; }
  .toc h2, .chapter h1 { font-size: 20pt; margin: 0 0 14pt; letter-spacing: -0.2pt; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 5pt 0; border-bottom: 1px solid var(--rule); font-size: 11pt; }
  .toc .n { color: var(--accent); font-weight: 700; margin-right: 8pt; }
  .toc .gap { color: var(--faint); font-style: italic; }

  /* Chapters */
  .chapter { break-before: page; }
  .chapter h1 .n { color: var(--accent); margin-right: 10pt; }
  h2 { font-size: 13pt; margin: 18pt 0 7pt; break-after: avoid; }
  h3 { font-size: 11pt; margin: 14pt 0 5pt; break-after: avoid; }
  p, li { orphans: 2; widows: 2; }
  a { color: var(--accent); text-decoration: none; }
  strong { color: #000; }

  /* The rule that keeps screenshots from eating pages */
  figure { margin: 12pt 0; break-inside: avoid; text-align: center; }
  figure img { max-width: 70%; max-height: 135mm; height: auto; border: 1px solid var(--rule); border-radius: 4pt; }
  figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 5pt; text-align: left; }

  blockquote {
    margin: 12pt 0; padding: 9pt 12pt; break-inside: avoid;
    background: var(--panel); border-left: 3pt solid var(--accent); border-radius: 0 4pt 4pt 0;
  }
  blockquote p { margin: 0 0 6pt; } blockquote p:last-child { margin: 0; }

  table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 9.5pt; break-inside: avoid; }
  th, td { border: 1px solid var(--rule); padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: var(--panel); font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4pt; }

  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9pt; background: var(--panel); padding: 1pt 3pt; border-radius: 3pt; }
  pre { background: var(--panel); padding: 9pt 11pt; border-radius: 5pt; overflow: hidden; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid var(--rule); margin: 16pt 0; }
`;

function buildHtml({ chapters, missing }, rendered) {
  const today = new Date().toISOString().slice(0, 10);

  // Written and unwritten entries interleave back into README order, so the
  // contents page reads as the book's plan with its gaps visible rather than
  // as a shorter book that happens to skip numbers.
  const toc = [
    ...chapters.map((c) => ({ ...c, gap: false })),
    ...missing.map((m) => ({ ...m, gap: true })),
  ]
    .sort((a, b) => a.number - b.number)
    .map(
      (e) =>
        `<li${e.gap ? ' class="gap"' : ""}><span class="n">${e.number}</span>${escapeHtml(e.title)}${
          e.gap ? " — not yet written" : ""
        }</li>`
    )
    .join("\n");

  const body = chapters
    .map(
      (c, i) => `
      <section class="chapter" id="ch-${c.number}">
        <h1><span class="n">${c.number}</span>${escapeHtml(c.title)}</h1>
        ${rendered[i]}
      </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Zakhira Handbook v${escapeHtml(version)}</title>
<style>${CSS}</style></head>
<body>
  <section class="cover">
    <h1>Zakhira</h1>
    <div class="sub">The handbook</div>
    <div class="rule"></div>
    <div class="meta">Version ${escapeHtml(version)} · ${today}<br>What the app does, for someone who will use it and never read the code.</div>
  </section>

  <section class="toc">
    <h2>Contents</h2>
    <ol>${toc}</ol>
  </section>

  ${body}
</body></html>`;
}

// ── Chrome ───────────────────────────────────────────────────────────────────

/** Where a usable Chrome lives, on a runner or a Mac. */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    `No Chrome found. Tried:\n  ${candidates.join("\n  ")}\nSet CHROME_PATH to override.`
  );
}

// ── Run ──────────────────────────────────────────────────────────────────────

const list = readChapterList();
const byFile = new Map(list.chapters.map((c) => [c.file, c]));

for (const c of list.chapters) {
  const path = join(HANDBOOK, c.file);
  if (!existsSync(path)) throw new Error(`Chapter ${c.number} points at a missing file: ${c.file}`);
}

const rendered = list.chapters.map((c) => renderChapter(c, byFile));
const html = buildHtml(list, rendered);

mkdirSync(dirname(outPath), { recursive: true });
const htmlPath = outPath.replace(/\.pdf$/, ".html");
writeFileSync(htmlPath, html, "utf8");

const chrome = findChrome();
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    `--print-to-pdf=${outPath}`,
    pathToFileURL(htmlPath).href,
  ],
  { stdio: "inherit" }
);

if (!existsSync(outPath)) throw new Error("Chrome exited without writing a PDF");
if (!keepHtml) {
  // The HTML is an intermediate; keep it only when debugging the layout.
  const { unlinkSync } = await import("node:fs");
  unlinkSync(htmlPath);
}

const kb = Math.round(readFileSync(outPath).length / 1024);
console.log(`\nZakhira handbook v${version}`);
console.log(`  ${list.chapters.length} chapter(s) bound${list.missing.length ? `, ${list.missing.length} listed but unwritten` : ""}`);
for (const e of [...list.chapters, ...list.missing].sort((a, b) => a.number - b.number)) {
  const bound = list.chapters.includes(e);
  console.log(`    ${String(e.number).padStart(2)}. ${e.title}${bound ? "" : "  — not yet written, skipped"}`);
}
console.log(`  → ${outPath} (${kb} KB)`);
