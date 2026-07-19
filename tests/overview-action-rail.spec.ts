import { AuditStatus } from "@prisma/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { prisma } from "../src/lib/prisma";

const capturePhase = process.env.OVERVIEW_ACTION_CAPTURE ?? "after";
const artifactRoot = path.join(
  process.cwd(),
  ".artifacts",
  "overview-action-rail",
  capturePhase,
);

let overviewPath = "";
let sessionToken = "";
const generatedDraftIds: string[] = [];
let generationCleanup:
  | {
      recommendationId: string;
      existingIds: string[];
      generatedAfter: Date;
    }
  | undefined;

test.beforeAll(async () => {
  const business = await prisma.business.findFirst({
    where: {
      name: "Schooners",
      audits: {
        some: {
          status: AuditStatus.COMPLETED,
          recommendations: { some: {} },
        },
      },
    },
    select: {
      id: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  if (!business?.owner.email) {
    throw new Error("A completed Schooners audit fixture is required.");
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  sessionToken = await encode({
    secret,
    token: {
      id: business.owner.id,
      sub: business.owner.id,
      name: business.owner.name,
      email: business.owner.email,
    },
  });
  overviewPath = `/dashboard/businesses/${business.id}/overview`;
});

test.afterAll(async () => {
  if (generatedDraftIds.length > 0) {
    await prisma.implementationDraft.deleteMany({
      where: { id: { in: generatedDraftIds } },
    });
  }
  if (generationCleanup) {
    await prisma.implementationDraft.deleteMany({
      where: {
        recommendationId: generationCleanup.recommendationId,
        createdAt: { gte: generationCleanup.generatedAfter },
        id: { notIn: generationCleanup.existingIds },
      },
    });
  }
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
  await page.goto(overviewPath, { waitUntil: "domcontentloaded" });
});

test("Next Three Moves controls form one stable responsive action rail", async ({
  page,
}, testInfo) => {
  const heading = page.getByRole("heading", { name: "Your next three moves" });
  await expect(heading).toBeVisible();
  const section = heading.locator("xpath=../../..");

  const artifactDirectory = path.join(artifactRoot, testInfo.project.name);
  await mkdir(artifactDirectory, { recursive: true });
  await section.screenshot({
    path: path.join(artifactDirectory, "next-three-moves.png"),
    animations: "disabled",
  });

  if (capturePhase === "before") return;

  const rails = section.locator('[data-task-action-rail="true"]');
  await expect(rails).toHaveCount(3);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable.");
  const usesDesktopRail = viewport.width >= 1024;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);

  if (["mobile-375", "desktop-1366"].includes(testInfo.project.name)) {
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }

  const railBoxes: Array<{ x: number; width: number }> = [];
  for (let index = 0; index < 3; index += 1) {
    const rail = rails.nth(index);
    const controls = rail.locator("a, button, select");
    await expect(controls).toHaveCount(4);

    const boxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, width: box.width, height: box.height };
      }),
    );
    const widths = boxes.map((box) => Math.round(box.width));
    const heights = boxes.map((box) => Math.round(box.height));
    expect(new Set(widths).size).toBe(1);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(36);

    for (let controlIndex = 0; controlIndex < 4; controlIndex += 1) {
      await controls.nth(controlIndex).focus();
      await expect(controls.nth(controlIndex)).toBeFocused();
    }

    const railBox = await rail.boundingBox();
    if (!railBox) throw new Error("Task action rail has no layout box.");
    railBoxes.push({ x: railBox.x, width: railBox.width });

    if (usesDesktopRail) {
      expect(widths[0]).toBe(160);
      expect(boxes.every((box) => Math.abs(box.x - boxes[0].x) < 1)).toBe(true);
    }
  }

  if (usesDesktopRail) {
    expect(railBoxes.every((box) => Math.abs(box.x - railBoxes[0].x) < 1)).toBe(
      true,
    );
    expect(railBoxes.every((box) => Math.round(box.width) === 160)).toBe(true);
  }

  if (testInfo.project.name === "desktop-1366") {
    const firstRail = rails.first();
    const taskLink = firstRail.getByRole("link", { name: "View Task" });
    await expect(taskLink).toHaveAttribute("href", /\/action-plan\?q=/);
    await expect(
      firstRail.getByRole("button", { name: /Generate Fix|View Draft|Show Implementation Steps/ }),
    ).toBeEnabled();

    const statusSelect = firstRail.getByRole("combobox", {
      name: "Change task status",
    });
    const originalStatus = await statusSelect.inputValue();
    const primaryAction = firstRail.getByRole("button", {
      name: /Start task|Mark complete|Move to To Do/,
    });
    await primaryAction.click();
    await expect(statusSelect).not.toHaveValue(originalStatus);
    const changedControlWidths = await firstRail
      .locator("a, button, select")
      .evaluateAll((elements) =>
        elements.map((element) =>
          Math.round(element.getBoundingClientRect().width),
        ),
      );
    expect(changedControlWidths).toEqual([160, 160, 160, 160]);
    await statusSelect.selectOption(originalStatus);
    await expect(statusSelect).toHaveValue(originalStatus);

    const recommendationId = await firstRail.getAttribute(
      "data-recommendation-id",
    );
    if (!recommendationId) throw new Error("Recommendation ID is unavailable.");
    const existingDrafts = await prisma.implementationDraft.findMany({
      where: { recommendationId },
      select: { id: true },
    });
    generationCleanup = {
      recommendationId,
      existingIds: existingDrafts.map((draft) => draft.id),
      generatedAfter: new Date(),
    };
    await firstRail
      .getByRole("button", {
        name: /Generate Fix|Show Implementation Steps/,
      })
      .click();
    const implementationDialog = page.getByRole("dialog");
    await expect(implementationDialog).toBeVisible();
    await expect(implementationDialog.getByText("Template fallback")).toBeVisible();
    const generatedDrafts = await prisma.implementationDraft.findMany({
      where: {
        recommendationId,
        createdAt: { gte: generationCleanup.generatedAfter },
      },
      select: { id: true },
    });
    expect(generatedDrafts).toHaveLength(1);
    generatedDraftIds.push(...generatedDrafts.map((draft) => draft.id));
    await implementationDialog
      .getByRole("button", { name: "Close Implementation Help" })
      .click();
    await expect(implementationDialog).toBeHidden();
  }
});
