import AxeBuilder from "@axe-core/playwright";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const canonicalOrigin = "https://growth-audit.example";
const artifactRoot = path.join(process.cwd(), ".artifacts", "marketing");

async function expectMeaningfulViewportPixels(screenshot: Buffer) {
  const image = await loadImage(screenshot);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const sampleHeight = Math.floor(image.height * 0.75);
  const pixels = context.getImageData(0, 0, image.width, sampleHeight).data;
  let visiblePixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 260) {
      visiblePixels += 1;
    }
  }
  expect(visiblePixels / (image.width * sampleHeight)).toBeGreaterThan(0.01);
}

test("marketing homepage is accurate, accessible, and responsive", async ({
  page,
  request,
}, testInfo) => {
  const projectName = testInfo.project.name;
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Viewport is unavailable.");

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible();
  const brandLogo = page.locator("[data-onread-logo]").first();
  await expect(brandLogo).toBeVisible();
  expect(
    await brandLogo.evaluate(
      (image) => (image as HTMLImageElement).naturalWidth,
    ),
  ).toBeGreaterThan(0);

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText("holding your website back");
  await expect(
    page.getByRole("heading", {
      name: "Stop guessing what deserves your attention.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "From website URL to verified improvement.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "A score is useful only when it leads to action.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Recommendations you can trace back to evidence.",
    }),
  ).toBeVisible();

  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toContain("EntryCore Fitness");
  expect(pageText).not.toContain("Know exactly");
  expect(pageText).not.toContain("Guaranteed growth");
  expect(pageText).not.toContain("Increase revenue automatically");
  expect(pageText).not.toContain("View Demo");
  expect(pageText).not.toContain("Social Growth");
  expect(pageText).not.toContain("Competitor Intelligence");
  expect(pageText).not.toContain("Google Business");
  expect(pageText).not.toContain("Review Score");

  const signupLinks = page.getByRole("link", {
    name: "Run a Website Audit",
    exact: true,
  });
  await expect(signupLinks.first()).toHaveAttribute("href", "/signup");
  await expect(
    page
      .getByRole("link", { name: "View Example Report", exact: true })
      .first(),
  ).toHaveAttribute("href", "/example-report");

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);

  const headerCta = page.locator('[data-marketing-cta="header"]');
  await headerCta.focus();
  await expect(headerCta).toBeFocused();

  if (viewport.width < 1024) {
    const menu = page.locator(".marketing-menu summary");
    await expect(menu).toBeVisible();
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator('.marketing-menu nav[aria-label="Mobile navigation"]'),
    ).toBeVisible();
    await expect(
      page
        .locator(".marketing-menu nav")
        .getByRole("link", { name: "Pricing" }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
  } else {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
  }

  const projectDirectory = path.join(artifactRoot, projectName);
  await mkdir(projectDirectory, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator("#hero-heading")).toBeVisible();
  const viewportScreenshot = await page.screenshot({
    animations: "disabled",
  });
  await expectMeaningfulViewportPixels(viewportScreenshot);
  await writeFile(
    path.join(projectDirectory, "homepage-viewport.png"),
    viewportScreenshot,
  );
  await page.screenshot({
    path: path.join(projectDirectory, "homepage-full.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const animationDuration = await page
    .locator(".marketing-preview")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.001);

  if (projectName === "laptop-1366") {
    const title = await page.title();
    expect(title.length).toBeGreaterThanOrEqual(50);
    expect(title.length).toBeLessThanOrEqual(65);

    const metaDescription = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(metaDescription).toBeTruthy();
    expect(metaDescription?.length).toBeGreaterThanOrEqual(140);
    expect(metaDescription?.length).toBeLessThanOrEqual(165);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonicalOrigin,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /Website & SEO Audit/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /opengraph-image/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute(
      "content",
      /noindex/i,
    );

    const jsonLdText = await page
      .locator("#homepage-structured-data")
      .textContent();
    expect(jsonLdText).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdText ?? "{}") as {
      "@graph": Array<Record<string, unknown>>;
    };
    const organization = jsonLd["@graph"].find(
      (entry) => entry["@type"] === "Organization",
    );
    const application = jsonLd["@graph"].find(
      (entry) => entry["@type"] === "WebApplication",
    );
    const faq = jsonLd["@graph"].find(
      (entry) => entry["@type"] === "FAQPage",
    ) as
      | {
          mainEntity?: Array<{
            name: string;
            acceptedAnswer: { text: string };
          }>;
        }
      | undefined;
    expect(organization).toBeTruthy();
    expect(organization).toHaveProperty(
      "logo",
      `${canonicalOrigin}/onread-logo.png`,
    );
    expect(organization).not.toHaveProperty("aggregateRating");
    expect(organization).not.toHaveProperty("sameAs");
    expect(organization).not.toHaveProperty("contactPoint");
    expect(application).toBeTruthy();
    expect(application).not.toHaveProperty("aggregateRating");
    expect(application).not.toHaveProperty("offers");

    const visibleFaqs = page.locator("#faq details");
    expect(faq?.mainEntity?.length).toBe(await visibleFaqs.count());
    for (let index = 0; index < (faq?.mainEntity?.length ?? 0); index += 1) {
      await expect(visibleFaqs.nth(index).locator("summary")).toHaveText(
        faq?.mainEntity?.[index]?.name ?? "",
      );
      const visibleAnswer = (
        await visibleFaqs.nth(index).locator("p").textContent()
      )?.trim();
      expect(visibleAnswer).toBe(faq?.mainEntity?.[index]?.acceptedAnswer.text);
    }

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    for (const route of [
      "/pricing",
      "/help",
      "/methodology",
      "/for-consultants",
      "/example-report",
      "/privacy",
      "/terms",
      "/signup",
      "/signin",
      "/verify-email",
      "/forgot-password",
      "/reset-password",
    ]) {
      const response = await request.get(route);
      expect(response.status(), `${route} should resolve`).toBeLessThan(400);
    }

    const robots = await request.get("/robots.txt");
    const robotsText = await robots.text();
    expect(robots.ok()).toBeTruthy();
    expect(robotsText).toContain("Disallow: /dashboard/");
    expect(robotsText).toContain(`${canonicalOrigin}/sitemap.xml`);

    const sitemap = await request.get("/sitemap.xml");
    const sitemapText = await sitemap.text();
    expect(sitemap.ok()).toBeTruthy();
    expect(sitemapText).toContain(`<loc>${canonicalOrigin}/</loc>`);
    expect(sitemapText).toContain(`<loc>${canonicalOrigin}/methodology</loc>`);
    expect(sitemapText).not.toContain("/dashboard");
    expect(sitemapText).not.toContain("localhost");

    const ogResponse = await request.get("/opengraph-image");
    expect(ogResponse.ok()).toBeTruthy();
    expect(ogResponse.headers()["content-type"]).toContain("image/png");
    await writeFile(
      path.join(artifactRoot, "opengraph-preview.png"),
      await ogResponse.body(),
    );

    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Plans for one website audit, ongoing improvement, and client delivery/,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(projectDirectory, "pricing-full.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.locator("[data-onread-logo]").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  }

  if (["mobile-375", "laptop-1366"].includes(projectName)) {
    await page.goto("/example-report", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Just Pie Orlando" }),
    ).toBeVisible();
    const exampleText = await page.locator("body").innerText();
    expect(exampleText).toContain("Sanitized fictional example");
    expect(exampleText).toContain("4 of 6 missing");
    expect(exampleText).not.toContain("Schooners");
    expect(exampleText).not.toContain("EntryCore");
    expect(exampleText).not.toContain("Harbor & Pine");
    expect(exampleText).not.toMatch(/cm[a-z0-9]{20,}/i);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: path.join(projectDirectory, "example-report-full.png"),
      fullPage: true,
      animations: "disabled",
    });
  }

  expect(browserErrors).toEqual([]);
});
