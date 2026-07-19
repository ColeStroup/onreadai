"use server";

import {
  ImplementationDraftStatus,
  type Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  buildImplementationContext,
  type ImplementationSourceInput,
} from "@/lib/ai/implementation-context";
import {
  generateImplementationHelp,
  type GeneratedImplementationHelp,
} from "@/lib/ai/implementation-help-generator";
import {
  canGenerateImplementationHelp,
  getImplementationHelpUsage,
} from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/observability/log";
import { requireUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export type ImplementationDraftView = {
  id: string;
  businessId: string;
  recommendationId: string | null;
  sourceKey: string | null;
  type: string;
  title: string;
  content: GeneratedImplementationHelp;
  source: string;
  status: ImplementationDraftStatus;
  createdAt: string;
  updatedAt: string;
};

export type ImplementationActionResult = {
  ok: boolean;
  error?: string;
  draft?: ImplementationDraftView;
  drafts?: ImplementationDraftView[];
  usage?: { used: number; limit: number };
  limitReached?: boolean;
};

export async function generateImplementationHelpAction(input: {
  businessId: string;
  source: ImplementationSourceInput;
}): Promise<ImplementationActionResult> {
  const user = await requireUser("/dashboard/businesses");
  const businessId = cleanId(input.businessId);
  const source = validateSource(input.source);

  if (!businessId || !source) {
    return { ok: false, error: "This implementation request is invalid." };
  }

  try {
    await enforceRateLimit({
      scope: "implementation-generate",
      identifiers: [user.id, businessId, await currentRequestRateLimitIdentifier()],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, error: "Please wait before generating another draft." };
    }
    throw error;
  }

  const context = await buildImplementationContext({
    userId: user.id,
    businessId,
    source,
  });

  if (!context) {
    return {
      ok: false,
      error: "The business task was not found or is no longer available.",
    };
  }

  const entitlement = await canGenerateImplementationHelp(user.id, businessId);

  if (!entitlement.allowed) {
    return {
      ok: false,
      error:
        entitlement.reason ??
        "Your current plan has reached its implementation generation limit.",
      usage: {
        used: entitlement.used ?? 0,
        limit: entitlement.limit ?? 0,
      },
      limitReached: true,
    };
  }

  try {
    const generated = await generateImplementationHelp(context);
    const draft = await prisma.implementationDraft.create({
      data: {
        businessId: context.businessId,
        recommendationId: context.recommendationId,
        auditId: context.auditId,
        userId: user.id,
        type: context.type,
        title: generated.title,
        content: generated as unknown as Prisma.InputJsonValue,
        sourceKey: context.sourceKey,
        source: generated.source,
        status: ImplementationDraftStatus.DRAFT,
      },
    });
    const usage = await getImplementationHelpUsage(user.id, businessId);

    revalidateImplementationPaths(businessId);

    return {
      ok: true,
      draft: serializeDraft(draft),
      usage: { used: usage.used, limit: usage.limit },
    };
  } catch (error) {
    logError("implementation_draft_generation_failed", error, {
      businessId,
      userId: user.id,
    });
    return {
      ok: false,
      error:
        "We could not create this draft right now. No generation was saved; please retry.",
    };
  }
}

export async function getImplementationDraftsAction(input: {
  businessId: string;
  source: ImplementationSourceInput;
}): Promise<ImplementationActionResult> {
  const user = await requireUser("/dashboard/businesses");
  const businessId = cleanId(input.businessId);
  const source = validateSource(input.source);

  if (!businessId || !source) {
    return { ok: false, error: "This implementation request is invalid." };
  }

  const context = await buildImplementationContext({
    userId: user.id,
    businessId,
    source,
  });

  if (!context) {
    return { ok: false, error: "The business task was not found." };
  }

  const drafts = await prisma.implementationDraft.findMany({
    where: {
      businessId,
      userId: user.id,
      sourceKey: context.sourceKey,
      status: { not: ImplementationDraftStatus.ARCHIVED },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const usage = await getImplementationHelpUsage(user.id, businessId);

  return {
    ok: true,
    drafts: drafts.map(serializeDraft),
    usage: { used: usage.used, limit: usage.limit },
  };
}

export async function updateImplementationDraftStatusAction(input: {
  businessId: string;
  draftId: string;
  status: "SAVED" | "APPLIED" | "ARCHIVED";
}): Promise<ImplementationActionResult> {
  const user = await requireUser("/dashboard/businesses");
  const businessId = cleanId(input.businessId);
  const draftId = cleanId(input.draftId);
  const status = parseMutableStatus(input.status);

  if (!businessId || !draftId || !status) {
    return { ok: false, error: "This draft update is invalid." };
  }

  const draft = await prisma.implementationDraft.findFirst({
    where: {
      id: draftId,
      businessId,
      userId: user.id,
      business: { ownerId: user.id },
    },
    select: { id: true },
  });

  if (!draft) {
    return { ok: false, error: "The implementation draft was not found." };
  }

  const updated = await prisma.implementationDraft.update({
    where: { id: draft.id },
    data: {
      status,
      appliedAt: status === ImplementationDraftStatus.APPLIED ? new Date() : null,
    },
  });

  revalidateImplementationPaths(businessId);
  return { ok: true, draft: serializeDraft(updated) };
}

function validateSource(value: unknown): ImplementationSourceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  if (source.kind === "recommendation") {
    const recommendationId = cleanId(source.recommendationId);
    return recommendationId
      ? { kind: "recommendation", recommendationId }
      : null;
  }

  if (source.kind === "social") {
    const strategyId = cleanId(source.strategyId);
    const itemKind = source.itemKind;
    const itemIndex = Number(source.itemIndex);

    if (
      !strategyId ||
      (itemKind !== "post" && itemKind !== "weekly") ||
      !Number.isInteger(itemIndex) ||
      itemIndex < 0 ||
      itemIndex > 30
    ) {
      return null;
    }

    return { kind: "social", strategyId, itemKind, itemIndex };
  }

  return null;
}

function parseMutableStatus(value: string) {
  if (value === "SAVED") return ImplementationDraftStatus.SAVED;
  if (value === "APPLIED") return ImplementationDraftStatus.APPLIED;
  if (value === "ARCHIVED") return ImplementationDraftStatus.ARCHIVED;
  return null;
}

function cleanId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
    ? value
    : "";
}

function serializeDraft(draft: {
  id: string;
  businessId: string;
  recommendationId: string | null;
  sourceKey: string | null;
  type: string;
  title: string;
  content: unknown;
  source: string;
  status: ImplementationDraftStatus;
  createdAt: Date;
  updatedAt: Date;
}): ImplementationDraftView {
  return {
    id: draft.id,
    businessId: draft.businessId,
    recommendationId: draft.recommendationId,
    sourceKey: draft.sourceKey,
    type: draft.type,
    title: draft.title,
    content: draft.content as GeneratedImplementationHelp,
    source: draft.source,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function revalidateImplementationPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/action-plan`);
  revalidatePath(`/dashboard/businesses/${businessId}/website`);
  revalidatePath(`/dashboard/businesses/${businessId}/seo`);
  revalidatePath(`/dashboard/businesses/${businessId}/reviews`);
  revalidatePath(`/dashboard/businesses/${businessId}/social`);
  revalidatePath("/dashboard/billing");
}
