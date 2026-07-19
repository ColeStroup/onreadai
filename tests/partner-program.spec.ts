import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const artifactRoot = path.join(process.cwd(), ".artifacts", "partners");

test("partner program public flow is accessible and responsive", async ({ page, request }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/partners", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Become a Certified Growth Partner." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Apply to the program|View application status/ })).toHaveAttribute("href", "/partners/apply");
  await expect(page.getByText("The customer stays in control.")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("does not guarantee leads, customers, conversions, revenue, or business outcomes");
  expect(body).not.toContain("guaranteed earnings");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  const firstFaq = page.locator('section[aria-labelledby="partner-faq"] details').first();
  await firstFaq.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(firstFaq).toHaveAttribute("open", "");

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Viewport unavailable.");
  const artifactDirectory = path.join(artifactRoot, testInfo.project.name);
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: path.join(artifactDirectory, "partners-full.png"), fullPage: true, animations: "disabled" });

  if (["mobile-375", "laptop-1366"].includes(testInfo.project.name)) {
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.goto("/partners/apply", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Apply for review." })).toBeVisible();
    await expect(page.getByLabel("Legal name")).toBeVisible();
    await expect(page.getByLabel("Website, optional")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    const applicationAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(applicationAccessibility.violations).toEqual([]);
  }

  if (testInfo.project.name === "laptop-1366") {
    for (const route of [
      "/partners/terms",
      "/partners/commission-policy",
      "/partners/promotion-standards",
      "/partners/scanner-policy",
    ]) {
      const response = await request.get(route);
      expect(response.status(), `${route} should resolve`).toBeLessThan(400);
    }

    const sitemapText = await (await request.get("/sitemap.xml")).text();
    expect(sitemapText).toContain("/partners</loc>");
    expect(sitemapText).toContain("/partners/commission-policy</loc>");
    expect(sitemapText).not.toContain("/preview/");
    expect(sitemapText).not.toContain("/r/");

    const robotsText = await (await request.get("/robots.txt")).text();
    expect(robotsText).toContain("Disallow: /preview/");
    expect(robotsText).toContain("Disallow: /r/");

    await page.goto("/r/active-partner?to=/pricing", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/pricing$/);
    const referralCookie = (await page.context().cookies()).find((cookie) => cookie.name === "onread_partner_referral");
    expect(referralCookie).toBeTruthy();
    expect(referralCookie?.httpOnly).toBe(true);
    expect(referralCookie?.sameSite).toBe("Lax");

    const firstTouchValue = referralCookie?.value;
    await page.goto("/r/training-partner?to=/", { waitUntil: "domcontentloaded" });
    const preservedCookie = (await page.context().cookies()).find((cookie) => cookie.name === "onread_partner_referral");
    expect(preservedCookie?.value).toBe(firstTouchValue);

    const invalidPreview = await request.get("/preview/not-a-real-preview-token");
    expect(invalidPreview.status()).toBe(404);
  }

  expect(browserErrors).toEqual([]);
});
