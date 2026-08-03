import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { prisma } from "../src/lib/prisma";

const businessName = "Schooners";
const auditId = "cmrkqxq8e0000wkbv9xccelme";
const screenshotProjects = new Set([
  "desktop-1366",
  "desktop-1920",
  "mobile-portrait",
]);

let presentationPath = "";
let sessionToken = "";

test.beforeAll(async () => {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      business: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!audit || audit.business.name !== businessName || !audit.business.owner.email) {
    throw new Error("The completed Schooners audit fixture is unavailable.");
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  sessionToken = await encode({
    secret,
    token: {
      id: audit.business.owner.id,
      sub: audit.business.owner.id,
      name: audit.business.owner.name,
      email: audit.business.owner.email,
    },
  });
  presentationPath = `/dashboard/businesses/${audit.business.id}/audit/${audit.id}/present`;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.beforeEach(async ({ context, baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is unavailable.");
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: sessionToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(presentationPath, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-presentation-root]")).toBeVisible();
});

test("Schooners deck is fixed, concise, navigable, and visually stable", async ({
  page,
  request,
}, testInfo) => {
  const projectName = testInfo.project.name;
  const capture = screenshotProjects.has(projectName);
  const outputDirectory = path.join(
    process.cwd(),
    ".artifacts",
    "presentation",
    projectName,
  );
  if (capture) await mkdir(outputDirectory, { recursive: true });

  const browserWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("[Presentation Mode]")) {
      browserWarnings.push(message.text());
    }
  });

  const counter = page.locator("header [data-slide-counter]");
  await expect(counter).toHaveText(/1 \/ \d+/);
  const initialCounter = (await counter.textContent()) ?? "";
  const slideCount = Number(initialCounter.split("/").at(1)?.trim());
  expect(slideCount).toBe(14);

  const allSlideText: string[] = [];
  for (let index = 0; index < slideCount; index += 1) {
    await page.waitForTimeout(80);
    const slide = page.locator("[data-presentation-slide]");
    await expect(slide).toBeVisible();
    await expect(slide).toHaveAttribute("data-slide-overflow", "false");
    allSlideText.push((await slide.innerText()).replace(/\s+/g, " "));

    const layout = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("[data-presentation-root]");
      const canvas = document.querySelector<HTMLElement>("[data-presentation-canvas]");
      const slide = document.querySelector<HTMLElement>("[data-presentation-slide]");
      const toolbar = root?.querySelector<HTMLElement>("header");
      const footer = root?.querySelector<HTMLElement>("footer");
      if (!root || !canvas || !slide || !toolbar || !footer) {
        throw new Error("Presentation layout elements are missing.");
      }
      const rootRect = root.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const clippedText = Array.from(slide.querySelectorAll<HTMLElement>("*"))
        .filter((element) => {
          if (
            !element.matches("p, h1, h2, h3, span, dt, dd, th, td, li, a, button") ||
            !element.textContent?.trim() ||
            element.offsetParent === null
          ) {
            return false;
          }
          const style = getComputedStyle(element);
          if (style.position === "absolute" || element.classList.contains("sr-only")) return false;
          const rect = element.getBoundingClientRect();
          return (
            rect.left < canvasRect.left - 2 ||
            rect.right > canvasRect.right + 2 ||
            rect.top < canvasRect.top - 2 ||
            rect.bottom > canvasRect.bottom + 2
          );
        })
        .map((element) => element.textContent?.trim().slice(0, 80));
      const textFontSizes = Array.from(slide.querySelectorAll<HTMLElement>("*"))
        .filter(
          (element) =>
            element.offsetParent !== null &&
            Boolean(element.textContent?.trim()) &&
            !element.classList.contains("sr-only"),
        )
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
        .filter(Number.isFinite);
      return {
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        root: {
          left: rootRect.left,
          top: rootRect.top,
          right: rootRect.right,
          bottom: rootRect.bottom,
        },
        viewport: { width: innerWidth, height: innerHeight },
        canvasInsideControls:
          canvasRect.top >= toolbarRect.bottom - 1 &&
          canvasRect.bottom <= footerRect.top + 1,
        slideScrolls:
          slide.scrollHeight > slide.clientHeight + 2 ||
          slide.scrollWidth > slide.clientWidth + 2,
        clippedText,
        minimumTextSize: Math.min(...textFontSizes),
        horizontalScrollbar: document.documentElement.offsetWidth > innerWidth,
      };
    });

    expect(layout.bodyOverflow).toBe("hidden");
    expect(layout.htmlOverflow).toBe("hidden");
    expect(layout.root).toEqual({
      left: 0,
      top: 0,
      right: layout.viewport.width,
      bottom: layout.viewport.height,
    });
    expect(layout.canvasInsideControls).toBe(true);
    expect(layout.slideScrolls).toBe(false);
    expect(layout.clippedText).toEqual([]);
    expect(layout.minimumTextSize).toBeGreaterThanOrEqual(10);
    expect(layout.horizontalScrollbar).toBe(false);

    if (capture) {
      await page.screenshot({
        path: path.join(outputDirectory, `slide-${String(index + 1).padStart(2, "0")}.png`),
        fullPage: false,
      });
    }
    if (index < slideCount - 1) {
      await page.getByRole("button", { name: "Next slide" }).click();
      await expect(counter).toHaveText(`${index + 2} / ${slideCount}`);
    }
  }

  const fullText = allSlideText.join(" ");
  expect(fullText).not.toMatch(/deterministic fallback/i);
  expect(fullText).not.toMatch(/other saved audit scores update|refreshed separately/i);
  expect(fullText).not.toMatch(/\b2\s*\/\s*4\s+confirmed profiles\b/i);
  expect(fullText).not.toMatch(/\bcm[a-z0-9]{20,}\b/i);
  expect(fullText).not.toMatch(/\.{3}|\u2026/);
  expect(fullText).not.toMatch(/engagement rate|social performance score/i);
  expect(fullText).toContain("2 confirmed / 4 detected");
  const competitorText = allSlideText.find((text) =>
    text.includes("The public side-by-side"),
  ) ?? "";
  for (const expected of [
    "Website",
    "81/100",
    "96/100",
    "SEO",
    "66/100",
    "100/100",
    "Competitor leads",
    "4.6 stars, 9,225 reviews",
    "Unavailable",
    "Not comparable",
    "Inferred competitor edge",
  ]) {
    expect(competitorText).toContain(expected);
  }
  expect(fullText).toContain("Evidence-based strategy");
  expect(fullText).toContain("CTA: View the menu");
  expect(fullText).toContain("Draft a clear homepage H1 for Schooners.");

  await page.keyboard.press("Home");
  await expect(counter).toHaveText(`1 / ${slideCount}`);
  await page.keyboard.press("Space");
  await expect(counter).toHaveText(`2 / ${slideCount}`);
  await page.keyboard.press("Shift+Space");
  await expect(counter).toHaveText(`1 / ${slideCount}`);
  await page.keyboard.press("End");
  await expect(counter).toHaveText(`${slideCount} / ${slideCount}`);
  await page.keyboard.press("PageUp");
  await expect(counter).toHaveText(`${slideCount - 1} / ${slideCount}`);
  await page.keyboard.press("PageDown");
  await expect(counter).toHaveText(`${slideCount} / ${slideCount}`);

  await expect(page.getByRole("link", { name: "Open AI Consultant" })).toHaveAttribute(
    "href",
    /\/chat$/,
  );
  await expect(page.getByRole("link", { name: "Open Action Plan" })).toHaveAttribute(
    "href",
    /\/action-plan$/,
  );

  if (projectName === "desktop-1366") {
    const pdfPath = presentationPath.replace(/\/present$/, "/pdf");
    const anonymousPdf = await request.get(pdfPath, { maxRedirects: 0 });
    expect(anonymousPdf.status()).toBe(401);

    const ownerPdf = await page.context().request.get(pdfPath);
    expect(ownerPdf.status()).toBe(200);
    expect(ownerPdf.headers()["content-type"]).toContain("application/pdf");
    expect(ownerPdf.headers()["content-disposition"]).toContain("attachment");
    expect((await ownerPdf.body()).subarray(0, 4).toString("ascii")).toBe("%PDF");

    await page.keyboard.press("Home");
    const thirdDot = page.getByRole("button", { name: /Go to slide 3:/ });
    await thirdDot.click();
    await expect(thirdDot).toHaveAttribute("aria-current", "step");

    const fullscreen = page.getByRole("button", { name: "Enter fullscreen" });
    if (await fullscreen.isEnabled()) {
      await fullscreen.click();
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
      await expect(page).toHaveURL(new RegExp(`${presentationPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/overview$/);
    }
  }

  if (projectName === "mobile-portrait") {
    await page.keyboard.press("Home");
    await page.locator("[data-presentation-root] main").evaluate((element) => {
      const start = new Touch({ identifier: 1, target: element, clientX: 330, clientY: 400 });
      const end = new Touch({ identifier: 1, target: element, clientX: 80, clientY: 400 });
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          changedTouches: [start],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          changedTouches: [end],
        }),
      );
    });
    await expect(counter).toHaveText(`2 / ${slideCount}`);
  }

  expect(browserWarnings).toEqual([]);
});
