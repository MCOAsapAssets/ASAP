// Builds every ASAP brief from src/ into dist/:
//   dist/html/asap-brief-<name>.html   the online brief (one self-contained file each)
//   dist/word/ASAP <Name> Brief.docx    a printable, type-in version of the same questions
// Usage: node build.js
// Paste your Google Apps Script web app URL into config.json first to switch on sending to the sheet.
"use strict";
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, HeightRule, AlignmentType, Footer, PageNumber, TabStopType
} = require("docx");

const ROOT = __dirname;
const BRIEFS = ["small-business", "marketing", "creators", "personalised"];
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const head = fs.readFileSync(path.join(ROOT, "src/template-head.html"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "src/engine.js"), "utf8");
const TAIL = "</script>\n\n</body>\n</html>\n";

function load(name, shoot) {
  const code = fs.readFileSync(path.join(ROOT, "src/briefs", name + ".js"), "utf8");
  const brief = new Function("SHOOT", code + "\nreturn BRIEF;")(shoot);
  // Same ordering as the online brief: questions follow the section order.
  brief.steps = brief.steps.map((s, i) => [brief.order.indexOf(s.sec), i, s]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  return { code, brief };
}

/* ---------- HTML ---------- */
function buildHtml(name) {
  const { code, brief } = load(name, false);
  const indented = code.trim().split("\n").map((l) => (l ? "  " + l : l)).join("\n");
  const script = engine
    .replace("/*@@BRIEF@@*/", indented.trimStart())
    .replace("/*@@SCRIPT_URL@@*/", (config.scriptUrl || "").replace(/"/g, ""));
  const html = head.replace("{{TITLE}}", brief.title).replace("{{LABEL}}", brief.label) + script + TAIL;
  const out = path.join(ROOT, "dist/html", "asap-brief-" + brief.file + ".html");
  fs.writeFileSync(out, html);
  return out;
}

/* ---------- Word ---------- */
const FONT = "Arial";
const PAGE_W = 11906, MARGIN = 1134, CONTENT_W = PAGE_W - MARGIN * 2; // A4, 2cm margins
const MUTED = "6F6F6F", LINE = "BFBFBF", WASH = "F2F2F2";
const box = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const boxBorders = { top: box, bottom: box, left: box, right: box };

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color, allCaps: o.caps, characterSpacing: o.spacing });
const para = (kids, o = {}) => new Paragraph({ children: Array.isArray(kids) ? kids : [kids], spacing: { before: o.before || 0, after: o.after == null ? 80 : o.after, line: o.line }, keepNext: o.keepNext, border: o.border, alignment: o.align, tabStops: o.tabs });

function cell(width, children, o = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: boxBorders,
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: children || [para(run(""), { after: 0 })]
  });
}
function table(widths, rows) {
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows });
}
function answerBox(height) {
  return table([CONTENT_W], [new TableRow({ height: { value: height, rule: HeightRule.ATLEAST }, cantSplit: true, children: [cell(CONTENT_W)] })]);
}
function labelled(pairs, rowHeight) {
  const w = [Math.round(CONTENT_W * 0.36), CONTENT_W - Math.round(CONTENT_W * 0.36)];
  return table(w, pairs.map((p) => new TableRow({
    height: { value: rowHeight || 520, rule: HeightRule.ATLEAST }, cantSplit: true,
    children: [cell(w[0], [para(run(p, { size: 18, color: MUTED }), { after: 0 })], { fill: WASH }), cell(w[1])]
  })));
}
function gridTable(step) {
  const fr = step.cols.map((c) => parseFloat(c[3]));
  const total = fr.reduce((a, b) => a + b, 0);
  const widths = fr.map((f) => Math.floor((CONTENT_W * f) / total));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const header = new TableRow({ tableHeader: true, children: step.cols.map((c, i) => cell(widths[i], [para(run(c[1], { size: 18, bold: true }), { after: 0 })], { fill: WASH })) });
  const blank = [];
  for (let i = 0; i < Math.max(step.start, 3) + 2; i++) {
    blank.push(new TableRow({ height: { value: 460, rule: HeightRule.ATLEAST }, cantSplit: true, children: widths.map((w) => cell(w)) }));
  }
  return table(widths, [header].concat(blank));
}
const gap = (after) => para(run(""), { after: after || 120 });

function whenNote(when, brief) {
  const src = brief.steps.find((s) => s.id === when.step);
  return para(run("Only if you picked " + when.any.map((a) => "\u201C" + a + "\u201D").join(" or ") + " in question " + (brief.steps.filter((s) => s.q).indexOf(src) + 1) + ".", { italics: true, size: 18, color: MUTED }), { keepNext: true });
}

function questionBlocks(step, n, brief, secWhen) {
  const out = [];
  out.push(para([run(n + ".  ", { bold: true, size: 22 }), run(step.q, { bold: true, size: 22 })], { before: 280, after: 60, keepNext: true }));
  if (step.when && !secWhen) out.push(whenNote(step.when, brief));
  if (step.hint) out.push(para(run(step.hint, { size: 19, color: MUTED }), { keepNext: true }));
  if (step.required) out.push(para(run(brief.mustText || "We need this one to plan your content", { size: 16, bold: true, caps: true, spacing: 20 }), { keepNext: true }));
  if (step.ph && step.type === "text") out.push(para(run(step.ph, { italics: true, size: 18, color: "9A9A9A" }), { keepNext: true }));

  if (step.type === "text") out.push(answerBox(1300));
  if (step.type === "fields") out.push(labelled(step.fields.map((f) => f[1])));
  if (step.type === "rows") {
    out.push(gridTable(step));
    step.cols.filter((c) => c[4]).forEach((c) => out.push(para([run(c[1] + " options: ", { size: 18, bold: true, color: MUTED }), run(c[4].join("  /  "), { size: 18, color: MUTED })], { before: 60 })));
  }
  if (step.type === "chips") {
    const how = step.multi ? (step.max ? "Pick up to " + step.max + "." : "Tick any that apply.") : "Pick one.";
    out.push(para(run(how + " Swap ☐ for ☒, or highlight your pick.", { size: 17, color: MUTED }), { keepNext: true }));
    out.push(para(step.options.map((o, i) => run((i ? "      " : "") + "☐ " + o, { size: 21 })), { after: 120, line: 360, keepNext: !!step.text }));
    if (step.text) {
      out.push(para(run(step.text[0], { size: 19, bold: true }), { keepNext: true }));
      out.push(answerBox(800));
    }
  }
  if (step.extras) {
    out.push(para(run("Got more to say? Optional", { size: 16, bold: true, caps: true, spacing: 20, color: MUTED }), { before: 160, keepNext: true }));
    out.push(labelled(step.extras, 700));
  }
  return out;
}

function buildDocx(name, shoot) {
  const { brief } = load(name, shoot);
  const title = "ASAP " + brief.name + " Brief" + (shoot ? " (Shoot Day)" : "");
  const kids = [];
  kids.push(para(run("ASAP ASSETS", { size: 16, bold: true, spacing: 60 }), { after: 120 }));
  kids.push(para(run(brief.name + " Brief" + (shoot ? ": Shoot Day" : ""), { size: 48, bold: true }), { after: 200 }));
  kids.push(para(run(brief.intro.title, { size: 24 }), { after: 160 }));
  kids.push(para(run("Type your answers straight into the boxes, then save and email this document to agency@asapassets.com.au. Rough notes are perfect. Not sure about something? Leave it blank and we'll cover it on our call.", { size: 20 }), { after: 120 }));
  kids.push(para(run("Prefer to talk? Record a voice memo answering the questions and email it to us instead.", { size: 20, color: MUTED }), { after: 240 }));
  kids.push(labelled(brief.intro.fields.map((f) => f[1])));

  const qs = brief.steps.filter((s) => s.q);
  brief.order.forEach((sec, si) => {
    const inSec = qs.filter((q) => q.sec === sec);
    if (!inSec.length) return;
    kids.push(para([run(String(si + 1).padStart(2, "0") + "   ", { size: 20, color: MUTED }), run(brief.sections[sec], { size: 32, bold: true })], {
      before: 480, after: 80, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "111111", space: 6 } }
    }));
    // A section that only shows for one pick gets the note once, under its heading.
    const key = (q) => JSON.stringify(q.when || null);
    const secWhen = inSec[0].when && inSec.every((q) => key(q) === key(inSec[0])) ? inSec[0].when : null;
    if (secWhen) kids.push(whenNote(secWhen, brief));
    inSec.forEach((q) => kids.push.apply(kids, questionBlocks(q, qs.indexOf(q) + 1, brief, secWhen)));
  });
  kids.push(gap(360));
  kids.push(para(run("That's everything. Save this document and email it to agency@asapassets.com.au.", { size: 20, bold: true })));

  const doc = new Document({
    creator: "ASAP Assets",
    title,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      footers: { default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        children: [run(title + "  ·  agency@asapassets.com.au", { size: 16, color: MUTED }), new TextRun({ children: ["\t", PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })]
      })] }) },
      children: kids
    }]
  });
  const out = path.join(ROOT, "dist/word", title + ".docx");
  return Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); return out; });
}

(async () => {
  for (const name of BRIEFS) {
    console.log(path.relative(ROOT, buildHtml(name)));
    console.log(path.relative(ROOT, await buildDocx(name, false)));
    if (name === "small-business") console.log(path.relative(ROOT, await buildDocx(name, true)));
  }
})();
