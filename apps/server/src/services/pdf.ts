import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { weekLabel } from "../../../../packages/shared/src/index.js";
import { config } from "../config.js";
import { sqlite } from "../db/client.js";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function formatTime(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function publicationHtml(publicationId: number, layout: "desktop" | "mobile" = "desktop") {
  const publication = sqlite
    .prepare(
      `SELECT id, academic_year AS academicYear, semester, week, version, title,
       published_at AS publishedAt FROM weekly_publications WHERE id=?`,
    )
    .get(publicationId) as Record<string, unknown>;
  const items = sqlite
    .prepare(
      `SELECT type, name, start_time AS startTime, end_time AS endTime,
       location, participants, department, remark
       FROM publication_items WHERE publication_id=? ORDER BY start_time, sort_order, id`,
    )
    .all(publicationId) as Array<Record<string, string>>;

  const groups = new Map<string, { date: Date; am: typeof items; pm: typeof items }>();
  for (const item of items) {
    const date = new Date(item.startTime);
    const key = date.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, { date, am: [], pm: [] });
    groups.get(key)![date.getHours() < 12 ? "am" : "pm"].push(item);
  }
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const renderItems = (values: typeof items) =>
    values.length
      ? values
          .map(
            (item) => `<article>
              <strong><span class="type">${item.type === "meeting" ? "会议" : "活动"}</span>${escapeHtml(item.name)}</strong>
              <div><b>时间：</b>${escapeHtml(formatTime(item.startTime))}${item.endTime ? `–${escapeHtml(formatTime(item.endTime))}` : ""}</div>
              <div><b>地点：</b>${escapeHtml(item.location)}</div>
              <div><b>参加人员：</b>${escapeHtml(item.participants)}</div>
              <div><b>承办单位：</b>${escapeHtml(item.department)}</div>
              ${item.remark ? `<div><b>内容简要：</b>${escapeHtml(item.remark)}</div>` : ""}
            </article>`,
          )
          .join("")
      : '<span class="empty">—</span>';
  const sortedGroups = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const rows = sortedGroups
    .map(
      (group) => `<tr>
        <td class="date">${String(group.date.getMonth() + 1).padStart(2, "0")}月${String(group.date.getDate()).padStart(2, "0")}日</td>
        <td class="weekday">${weekdays[group.date.getDay()]}</td>
        <td>${renderItems(group.am)}</td>
        <td>${renderItems(group.pm)}</td>
      </tr>`,
    )
    .join("");
  const mobileSections = sortedGroups
    .flatMap((group) =>
      ([
        ["上午", group.am],
        ["下午", group.pm],
      ] as const).flatMap(([periodLabel, periodItems]) =>
        periodItems.map(
          (item) => `<section class="day-card">
            <div class="day-heading">
              <strong>${String(group.date.getMonth() + 1).padStart(2, "0")}月${String(group.date.getDate()).padStart(2, "0")}日</strong>
              <span>星期${weekdays[group.date.getDay()]}</span>
            </div>
            <div class="period"><h2>${periodLabel}</h2>${renderItems([item])}</div>
          </section>`,
        ),
      ),
    )
    .join("");

  const logoPath = path.resolve(process.cwd(), "apps/web/public/brand/logo.svg");
  const logoUrl = `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  if (layout === "mobile") {
    return `<!doctype html>
    <html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page { size: 108mm 192mm; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17212b; font-family: "Noto Sans SC","Microsoft YaHei",sans-serif; font-size: 15px; line-height: 1.65; }
    @media screen { body { max-width: 680px; margin: 0 auto; padding: 22px 16px 32px; background: #f5f7f6; } }
    header { text-align: center; margin-bottom: 16px; position: relative; break-after: avoid; }
    header img { width: 46px; height: 46px; margin-bottom: 7px; }
    h1 { margin: 0; font: 700 23px "Noto Serif SC","SimSun",serif; letter-spacing: .06em; }
    .subtitle { margin-top: 5px; color: #4b5d69; font-size: 13px; }
    .day-card { overflow: hidden; margin-bottom: 14px; border: 1px solid #8fa19a; border-radius: 8px; break-inside: avoid; background: #fff; }
    .day-heading { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: #17324d; color: #fff; }
    .day-heading strong { font-size: 17px; }
    .day-heading span { font-size: 13px; color: #d8e6df; }
    .period { padding: 10px 12px 12px; }
    .period + .period { border-top: 1px solid #c7d1cd; }
    .period h2 { margin: 0 0 7px; color: #245b43; font-size: 15px; }
    article + article { border-top: 1px dashed #9aa9a3; margin-top: 10px; padding-top: 10px; }
    article strong { display: block; margin-bottom: 4px; font-size: 16px; line-height: 1.45; }
    article .type { display: inline-block; margin-right: 6px; border-radius: 4px; padding: 1px 5px; background: #e2eee7; color: #245b43; font-size: 12px; }
    article div { white-space: pre-wrap; overflow-wrap: anywhere; }
    footer { margin-top: 10px; color: #6b7780; font-size: 11px; text-align: center; }
    </style></head><body>
    <header>
      <img src="${logoUrl}" alt="">
      <h1>${escapeHtml(publication.title)}</h1>
      <div class="subtitle">${escapeHtml(publication.academicYear)}学年度第${escapeHtml(publication.semester)}学期 · ${escapeHtml(weekLabel(Number(publication.week)))}</div>
    </header>
    <main>${mobileSections}</main>
    <footer>${escapeHtml(config.organizationName)} · V${escapeHtml(publication.version)} · ${escapeHtml(formatDateTime(publication.publishedAt))}</footer>
    </body></html>`;
  }
  return `<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #17212b; font-family: "Noto Sans SC","Microsoft YaHei",sans-serif; font-size: 12.5px; }
  @media screen { body { padding: 24px clamp(16px, 4vw, 64px) 32px; } }
  header { text-align:center; margin-bottom: 10px; position: relative; }
  header img { position:absolute; left:0; top:0; width:42px; height:42px; }
  h1 { margin:0; font: 700 22px "Noto Serif SC","SimSun",serif; letter-spacing: .08em; }
  .subtitle { margin-top:4px; color:#4b5d69; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th,td { border:1px solid #263c4d; padding:6px; vertical-align:top; }
  th { background:#eef2ef; font-size:14px; }
  th:nth-child(1){width:8%} th:nth-child(2){width:5%} th:nth-child(3),th:nth-child(4){width:43.5%}
  .date,.weekday { text-align:center; vertical-align:middle; font-weight:600; }
  article + article { border-top:1px dashed #9aa9a3; margin-top:6px; padding-top:6px; }
  article strong { display:block; font-size:13.5px; margin-bottom:3px; }
  article .type { display:inline-block; margin-right:5px; border-radius:3px; padding:1px 4px; background:#e2eee7; color:#245b43; font-size:10.5px; }
  article div { line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
  .empty { display:block; text-align:center; color:#9aa5ad; }
  footer { margin-top:6px; color:#6b7780; display:flex; justify-content:space-between; }
  </style></head><body>
  <header>
    <img src="${logoUrl}" alt="">
    <h1>${escapeHtml(publication.title)}</h1>
    <div class="subtitle">${escapeHtml(publication.academicYear)}学年度第${escapeHtml(publication.semester)}学期 · ${escapeHtml(weekLabel(Number(publication.week)))}</div>
  </header>
  <table><thead><tr><th>日期</th><th>星期</th><th>上午</th><th>下午</th></tr></thead><tbody>${rows}</tbody></table>
  <footer><span>${escapeHtml(config.organizationName)}</span><span>版本 V${escapeHtml(publication.version)} · 发布于 ${escapeHtml(formatDateTime(publication.publishedAt))}</span></footer>
  </body></html>`;
}

export async function generatePublicationPdf(publicationId: number) {
  fs.mkdirSync(config.pdfStoragePath, { recursive: true });
  const html = publicationHtml(publicationId, "desktop");
  const mobileHtml = publicationHtml(publicationId, "mobile");
  const htmlPath = path.join(config.pdfStoragePath, `publication-${publicationId}.html`);
  const pdfPath = path.join(config.pdfStoragePath, `publication-${publicationId}.pdf`);
  const mobileHtmlPath = path.join(config.pdfStoragePath, `publication-${publicationId}-mobile.html`);
  const mobilePdfPath = path.join(config.pdfStoragePath, `publication-${publicationId}-mobile.pdf`);
  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(mobileHtmlPath, mobileHtml, "utf8");
  const browser = await chromium.launch({
    headless: true,
    executablePath: config.chromiumPath,
  });
  try {
    const page = await browser.newPage();
    await page.goto(new URL(`file:///${htmlPath.replaceAll("\\", "/")}`).href, {
      waitUntil: "networkidle",
    });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "13mm", right: "13mm", bottom: "13mm", left: "13mm" },
    });
    await page.goto(new URL(`file:///${mobileHtmlPath.replaceAll("\\", "/")}`).href, {
      waitUntil: "networkidle",
    });
    await page.pdf({
      path: mobilePdfPath,
      width: "108mm",
      height: "192mm",
      landscape: false,
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
  } finally {
    await browser.close();
  }
  const hash = crypto.createHash("sha256").update(fs.readFileSync(pdfPath)).digest("hex");
  sqlite
    .prepare("UPDATE weekly_publications SET pdf_path=?, pdf_sha256=? WHERE id=?")
    .run(pdfPath, hash, publicationId);
  return { pdfPath, mobilePdfPath, hash };
}

export function mobilePdfPath(pdfPath: string) {
  return pdfPath.replace(/\.pdf$/i, "-mobile.pdf");
}
