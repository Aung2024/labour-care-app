#!/usr/bin/env node
/**
 * Capture mobile screenshots for the user manual.
 *
 * Usage:
 *   MANUAL_EMAIL=you@example.com MANUAL_PASSWORD=secret node scripts/capture-manual-screenshots.mjs
 *
 * Optional:
 *   MANUAL_BASE_URL=https://mnch-moh.netlify.app
 *   MANUAL_PATIENT_SEARCH=Demo
 *   MANUAL_HEADED=1  (show browser)
 */
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "user-manual-assets");
const PORT = Number(process.env.MANUAL_PORT || 8765);
const BASE_URL = (process.env.MANUAL_BASE_URL || "https://mnch-moh.netlify.app").replace(/\/$/, "");
const EMAIL = process.env.MANUAL_EMAIL || "";
const PASSWORD = process.env.MANUAL_PASSWORD || "";
const PATIENT_SEARCH = process.env.MANUAL_PATIENT_SEARCH || "";
const HEADED = process.env.MANUAL_HEADED === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** @type {Array<{file:string, path?:string, public?:boolean, setup?:string, scrollTo?:string, waitFor?:string, note?:string}>} */
const SHOTS = [
  { file: "01-login.png", path: "login.html", public: true },
  { file: "02-registration.png", path: "registration.html", public: true },
  {
    file: "03-registration-success.png",
    path: "registration.html",
    public: true,
    note: "Scroll to success/confirmation area if visible after demo submit",
  },
  { file: "03-provider-consent.png", path: "provider-consent.html", note: "Captured during login if shown" },
  { file: "04-home.png", path: "home.html", waitFor: ".dashboard-container, .home-container, main, body" },
  { file: "28-home-cards.png", path: "home.html", scrollTo: ".card, .home-card, .dashboard-card", waitFor: "body" },
  { file: "05-patient-registration.png", path: "patient-enhanced.html", waitFor: "#name" },
  {
    file: "05b-registration-alerts.png",
    path: "patient-enhanced.html",
    setup: "registrationAlerts",
    waitFor: "#ageRiskAlert, #name",
  },
  { file: "06-patient-consent.png", path: "patient-consent.html", setup: "patientConsent", public: true },
  { file: "07-patient-list.png", path: "list.html", waitFor: "#patientListContainer, .patient-list, table, body" },
  { file: "08-patient-care-hub.png", path: "patient-care-hub.html", setup: "selectedPatient" },
  { file: "09-anc-hub.png", path: "antenatal-care.html", setup: "selectedPatient" },
  {
    file: "10-anc-form-top.png",
    path: "antenatal-form.html",
    setup: "selectedPatient",
    waitFor: "#ancForm, #visitDate",
  },
  {
    file: "10-anc-form-vitals.png",
    path: "antenatal-form.html",
    setup: "selectedPatient",
    scrollTo: "#systolicBP, #weight, .danger-signs-card",
    waitFor: "#ancForm",
  },
  { file: "10-anc-form.png", path: "antenatal-form.html", setup: "selectedPatient", note: "Legacy single; skipped if split exists" },
  { file: "11-anc-report.png", path: "antenatal-report.html", setup: "selectedPatient" },
  { file: "12-anc-tests.png", path: "antenatal-tests.html", setup: "selectedPatient" },
  { file: "13-labour-setup.png", path: "labour-care-setup.html", setup: "selectedPatientQuery" },
  { file: "14-lcg-entry.png", path: "labour-care-entry.html", setup: "selectedPatientQuery" },
  { file: "15-lcg-summary.png", path: "summary-view.html", setup: "selectedPatientQuery" },
  { file: "16-transfer.png", path: "transfer-patient.html", setup: "selectedPatientQuery" },
  { file: "17-newborn-hub.png", path: "immediate-newborn-care.html", setup: "selectedPatient" },
  { file: "18-newborn-form.png", path: "newborn-care-page.html", setup: "selectedPatient" },
  {
    file: "18-newborn-identity.png",
    path: "newborn-care-page.html",
    setup: "selectedPatient",
    waitFor: "#birth_time, form",
  },
  {
    file: "18-newborn-vitals-kmc.png",
    path: "newborn-care-page.html",
    setup: "selectedPatient",
    scrollTo: "#temperature, #kmcCareSection, .kmc",
  },
  { file: "19-newborn-report.png", path: "newborn-report.html", setup: "selectedPatientQuery" },
  { file: "20-pnc-hub.png", path: "postpartum-care.html", setup: "selectedPatient" },
  {
    file: "21-pnc-form-top.png",
    path: "postpartum-form.html",
    setup: "selectedPatient",
    waitFor: "#visitDate, form",
  },
  {
    file: "21-pnc-form-exam.png",
    path: "postpartum-form.html",
    setup: "selectedPatient",
    scrollTo: "#vaginalBleeding, #heavyBleeding, #maternalOutcome",
  },
  { file: "21-pnc-form.png", path: "postpartum-form.html", setup: "selectedPatient", note: "Legacy single" },
  { file: "22-pnc-report.png", path: "postpartum-report.html", setup: "selectedPatientQuery" },
  { file: "23-vaccine-home.png", path: "vaccine-home.html", setup: "babyPatientQuery" },
  { file: "24-vaccine-record.png", path: "vaccine-record.html", setup: "babyPatientQuery" },
  { file: "25-overall-report.png", path: "overall-patient-report.html", setup: "selectedPatientQuery" },
  { file: "26-print-report.png", path: "antenatal-report.html", setup: "selectedPatient", setupExtra: "printMode" },
  { file: "27-offline-sync.png", path: "home.html", setup: "offlineBanner" },
];

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const rel = urlPath === "/" ? "/login.html" : urlPath;
        const filePath = path.join(ROOT, rel.replace(/^\//, ""));
        if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const MOBILE_DPR = 3;

async function prepareForScreenshot(page) {
  await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
  await page.addStyleTag({
    content: `
      .footer, footer, .sticky-save-bar, .save-bar, [class*="save-bar"] {
        visibility: visible !important;
        opacity: 1 !important;
        transform: none !important;
        pointer-events: auto !important;
      }
    `,
  });
}

async function hideOverlays(page) {
  await prepareForScreenshot(page);
  await page.addStyleTag({
    content: `
      .pwa-update-banner, #offlineBanner, .offline-banner { opacity: 0.95 !important; }
    `,
  });
}

async function captureViewport(page, filePath) {
  await prepareForScreenshot(page);
  await page.waitForTimeout(300);
  const { width, height } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  await page.screenshot({
    path: filePath,
    type: "png",
    animations: "disabled",
    clip: { x: 0, y: 0, width, height },
  });
}

async function scrollToSelector(page, selector) {
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      return true;
    }
  }
  await page.evaluate(() => window.scrollTo(0, Math.min(900, document.body.scrollHeight * 0.45)));
  await page.waitForTimeout(400);
  return false;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#email", { timeout: 30000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('#loginForm button[type="submit"]');

  await page.waitForTimeout(2000);
  for (let i = 0; i < 45; i++) {
    const url = page.url();
    if (url.includes("provider-consent.html")) {
      const consentShot = path.join(OUT_DIR, "03-provider-consent.png");
      await hideOverlays(page);
      await captureViewport(page, consentShot);
      const agree = page.locator("#agreeBtn");
      if ((await agree.count()) > 0) {
        await agree.click();
        await page.waitForTimeout(2500);
      }
      continue;
    }
    if (url.includes("home.html")) return;
    if (url.includes("login.html")) {
      const err = await page.locator("#message .alert").first().textContent().catch(() => "");
      if (err && i > 10 && !/Redirecting|Welcome|အောင်မြင်/i.test(err)) {
        throw new Error(`Login error: ${err.trim().slice(0, 200)}`);
      }
    }
    await page.waitForTimeout(1000);
  }

  if (!page.url().includes("home.html")) {
    throw new Error(`Login did not reach home.html (at ${page.url()}).`);
  }
}

let cachedPatientId = null;
let cachedBabyPatientId = null;

async function pickPatientFromList(page) {
  await page.goto(`${BASE_URL}/list.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  const search = page.locator("#searchInput").first();
  if (PATIENT_SEARCH && (await search.count()) > 0) {
    await search.fill(PATIENT_SEARCH);
    await page.waitForTimeout(2000);
  }
  const card = page.locator(".patient-card").first();
  const row = page.locator("tr.patient-data-row, tbody tr[data-patient-id]").first();
  if ((await card.count()) > 0) {
    await card.click();
  } else if ((await row.count()) > 0) {
    await row.click();
  } else {
    await page.locator("tbody tr").nth(1).click();
  }
  await page.waitForURL(/patient-care-hub/, { timeout: 30000 });
  cachedPatientId = await page.evaluate(() => sessionStorage.getItem("selectedPatientId"));
  if (!cachedPatientId) {
    throw new Error("Could not select a patient from list.");
  }
  console.log("Selected patient:", cachedPatientId);
}

async function applySetup(page, setup, context) {
  if (!setup) return;
  if (setup === "patientConsent") {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "pendingPatientData",
        JSON.stringify({
          name: "Manual Demo Mother",
          age: "28",
          phone: "09123456789",
          gravida_value: "2",
          parity_primary: "1",
          registration_date: new Date().toISOString().slice(0, 10),
        })
      );
    });
    return;
  }
  if (setup === "providerConsent") {
    await page.addInitScript(() => {
      localStorage.setItem("rememberMe", "true");
    });
    return;
  }
  if (setup === "registrationAlerts") {
    await page.goto(`${BASE_URL}/patient-enhanced.html`, { waitUntil: "domcontentloaded" });
    await page.fill("#name", "Manual Demo");
    await page.fill("#age", "17");
    await page.selectOption("#gravidaSelect", "1");
    await page.selectOption("#parityPrimarySelect", "0");
    await page.waitForTimeout(600);
    return;
  }
  if (setup === "selectedPatient" || setup === "selectedPatientQuery" || setup === "babyPatientQuery") {
    if (!context.loggedIn) return;
    if (!cachedPatientId) await pickPatientFromList(page);
    const pid = setup === "babyPatientQuery" ? cachedBabyPatientId || cachedPatientId : cachedPatientId;
    if (!pid) throw new Error("No patient id in session");
    await page.addInitScript((id) => {
      sessionStorage.setItem("selectedPatientId", id);
    }, pid);
    return;
  }
  if (setup === "offlineBanner") {
    // home with sync area visible
    return;
  }
  if (setup === "printMode") {
    await page.emulateMedia({ media: "print" });
    return;
  }
}

async function runShot(page, shot, context) {
  const out = path.join(OUT_DIR, shot.file);
  if (shot.file === "03-provider-consent.png" && existsSync(out)) {
    return { file: shot.file, status: "ok_login_flow" };
  }
  if (shot.note?.includes("Legacy") && existsSync(out)) {
    return { file: shot.file, status: "skipped_legacy" };
  }
  if (!shot.public && !context.loggedIn) {
    return { file: shot.file, status: "skipped_no_auth" };
  }
  try {
    if (shot.setup === "registrationAlerts") {
      await hideOverlays(page);
      await captureViewport(page, out);
      return { file: shot.file, status: "ok" };
    }
    if (shot.path) {
      const url =
        shot.setup === "selectedPatientQuery" || shot.setup === "babyPatientQuery"
          ? `${BASE_URL}/${shot.path}?patient=${cachedPatientId}`
          : `${BASE_URL}/${shot.path}`;
      await applySetup(page, shot.setup, context);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(shot.public ? 1200 : 3500);
      if (shot.waitFor) {
        await page.locator(shot.waitFor).first().waitFor({ timeout: 12000 }).catch(() => {});
      }
      if (shot.setup === "printMode") {
        await page.emulateMedia({ media: "print" });
      }
      if (shot.scrollTo) await scrollToSelector(page, shot.scrollTo);
      else await page.evaluate(() => window.scrollTo(0, 0));
      await hideOverlays(page);
      await captureViewport(page, out);
      return { file: shot.file, status: "ok" };
    }
    return { file: shot.file, status: "skipped_no_path" };
  } catch (err) {
    return { file: shot.file, status: "error", error: String(err.message || err) };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const useLocal = process.env.MANUAL_USE_LOCAL === "1";
  const server = useLocal ? await startStaticServer() : null;
  const iPhone = devices["iPhone 13"];
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: MOBILE_WIDTH, height: MOBILE_HEIGHT },
    deviceScaleFactor: MOBILE_DPR,
    isMobile: true,
    hasTouch: true,
    userAgent: iPhone.userAgent,
    locale: "my-MM",
    colorScheme: "light",
  });
  const page = await context.newPage();
  const runContext = { loggedIn: false };
  const results = [];

  if (EMAIL && PASSWORD) {
    try {
      await login(page);
      runContext.loggedIn = true;
      await pickPatientFromList(page);
      console.log("Logged in. Patient:", cachedPatientId || "(unknown)");
    } catch (err) {
      console.warn("Auth failed:", err.message);
    }
  } else {
    console.warn("MANUAL_EMAIL / MANUAL_PASSWORD not set — only public pages will be captured.");
  }

  for (const shot of SHOTS) {
    const result = await runShot(page, shot, runContext);
    results.push(result);
    console.log(`${result.status.padEnd(16)} ${shot.file}${result.error ? " — " + result.error : ""}`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    viewport: `${MOBILE_WIDTH}x${MOBILE_HEIGHT} @${MOBILE_DPR}x`,
    outputDir: "docs/user-manual-assets",
    baseUrl: BASE_URL,
    authenticated: runContext.loggedIn,
    results,
  };
  writeFileSync(path.join(OUT_DIR, "capture-manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(
    path.join(OUT_DIR, "README.md"),
    buildReadme(results)
  );

  await browser.close();
  if (server) server.close();
  const ok = results.filter((r) => r.status === "ok").length;
  console.log(`\nDone: ${ok}/${results.length} screenshots in ${OUT_DIR}`);
  if (!runContext.loggedIn) {
    console.log("Set MANUAL_EMAIL and MANUAL_PASSWORD to capture authenticated screens.");
  }
}

function buildReadme(results) {
  const lines = [
    "# User Manual Screenshots",
    "",
    "Mobile viewport (iPhone 13). Filenames match `m-MNCH_Care_User_Manual.docx` placeholders.",
    "",
    "Capture:",
    "```bash",
    "npm install --prefix scripts playwright",
    "npx --prefix scripts playwright install chromium",
    "MANUAL_EMAIL=you@example.com MANUAL_PASSWORD=secret node scripts/capture-manual-screenshots.mjs",
    "```",
    "",
    "Long forms use **two mobile screenshots** (top + scrolled section), e.g. ANC, PNC, Newborn, Registration alerts.",
    "",
    "## Files",
    "",
  ];
  for (const r of results) {
    lines.push(`- \`${r.file}\` — ${r.status}${r.error ? ` (${r.error})` : ""}`);
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
