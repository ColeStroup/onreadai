"use server";

import {
  AuditStatus,
  ChatRole,
  CompetitorStatus,
  ProfilePlatform,
} from "@prisma/client";
import { notFound } from "next/navigation";

import {
  generateConsultantResponseResult,
  isOpenAIConfigured,
} from "@/lib/ai/openai-consultant";
import {
  ConsultantPipelineError,
  isConsultantPipelineError,
} from "@/lib/ai/consultant-errors";
import { buildCompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import { compareAudits } from "@/lib/audits/audit-comparison";
import { canSendAiMessage } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import {
  isCompetitorIntelligenceEnabled,
  isLocalGrowthEnabled,
  isSocialGrowthEnabled,
} from "@/lib/features/feature-flags";
import {
  isWebsiteSeoCategory,
  isWebsiteSeoReportCategory,
} from "@/lib/product/website-seo-scope";
import { buildCurrentReviewAnalysis } from "@/lib/reviews/current-review-analysis";
import { persistConsultantExchange } from "@/lib/chat/consultant-message-persistence";
import {
  mapConsultantFailure,
  type ConsultantClientErrorCode,
} from "@/lib/chat/consultant-error-mapping";
import { createConsultantDiagnostics } from "@/lib/observability/consultant-diagnostics";
import { logError, logInfo } from "@/lib/observability/log";
import { requireUser } from "@/lib/session";
import { parseSocialStrategy } from "@/lib/social-strategy";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export type ChatMessageView = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
};

export type ChatMode = "ai" | "unavailable";

type SendChatMessageResult = {
  messages: ChatMessageView[];
  mode?: ChatMode;
  error?: string;
  errorCode?:
    "VALIDATION" | "LIMIT_REACHED" | "NO_AUDIT" | ConsultantClientErrorCode;
};

type ClearChatHistoryResult = {
  messages: ChatMessageView[];
  mode: ChatMode;
  error?: string;
};

const maxUserMessageLength = 2000;

function toViewMessage(message: {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}): ChatMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function sendChatMessage({
  businessId,
  content,
}: {
  businessId: string;
  content: string;
}): Promise<SendChatMessageResult> {
  const user = await requireUser(`/dashboard/businesses/${businessId}/chat`);
  const question = content.trim();
  const diagnostics = createConsultantDiagnostics();
  const socialGrowthEnabled = isSocialGrowthEnabled();
  const competitorIntelligenceEnabled = isCompetitorIntelligenceEnabled();
  const localGrowthEnabled = isLocalGrowthEnabled();

  if (!question) {
    return {
      messages: [],
      error: "Enter a question before sending.",
      errorCode: "VALIDATION",
    };
  }

  if (question.length > maxUserMessageLength) {
    return {
      messages: [],
      error: `Keep messages under ${maxUserMessageLength.toLocaleString()} characters.`,
      errorCode: "VALIDATION",
    };
  }

  if (!isOpenAIConfigured()) {
    return {
      messages: [],
      mode: "unavailable",
      error:
        "The AI Consultant is not configured for this environment. Contact support if this continues.",
      errorCode: "PROVIDER_CONFIGURATION",
    };
  }

  try {
    await enforceRateLimit({
      scope: "ai-chat",
      identifiers: [
        user.id,
        businessId,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 30,
      windowMs: 5 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        messages: [],
        mode: "ai",
        error: "Please wait before sending another message.",
        errorCode: "LIMIT_REACHED",
      };
    }
    throw error;
  }

  const aiMessageCheck = await canSendAiMessage(user.id);

  if (!aiMessageCheck.allowed) {
    return {
      messages: [],
      mode: "ai",
      error:
        aiMessageCheck.reason ??
        "Your current plan has reached the monthly AI message limit.",
      errorCode: "LIMIT_REACHED",
    };
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    include: {
      audits: {
        where: {
          status: AuditStatus.COMPLETED,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 2,
        include: {
          scores: true,
          findings: true,
          recommendations: true,
        },
      },
      profiles: {
        where: socialGrowthEnabled
          ? undefined
          : { platform: ProfilePlatform.WEBSITE },
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
      googleBusinessProfiles: {
        where: localGrowthEnabled
          ? undefined
          : { id: "disabled-launch-module" },
        orderBy: [
          {
            status: "asc",
          },
          {
            matchConfidence: "desc",
          },
        ],
      },
      competitors: {
        where: competitorIntelligenceEnabled
          ? { status: CompetitorStatus.ACTIVE }
          : { id: "disabled-launch-module" },
        orderBy: {
          name: "asc",
        },
        select: {
          name: true,
          websiteUrl: true,
          notes: true,
          discoveredProfiles: {
            select: {
              platform: true,
              label: true,
              status: true,
            },
          },
        },
      },
      socialStrategies: {
        where: socialGrowthEnabled
          ? undefined
          : { id: "disabled-launch-module" },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!business) {
    notFound();
  }

  const latestAudit = business.audits.at(0);
  const previousAudit = business.audits.at(1);
  const socialStrategy = socialGrowthEnabled
    ? parseSocialStrategy(business.socialStrategies.at(0))
    : null;

  if (!latestAudit) {
    return {
      messages: [],
      error: "Run an audit before chatting with your AI consultant.",
      errorCode: "NO_AUDIT",
    };
  }

  logInfo("consultant_started", {
    businessId: business.id,
    auditId: latestAudit.id,
  });

  const thread =
    (await prisma.chatThread.findFirst({
      where: {
        businessId,
        userId: user.id,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })) ??
    (await prisma.chatThread.create({
      data: {
        businessId,
        userId: user.id,
        title: "Growth Strategy Chat",
      },
    }));

  const recentChatHistory = (
    await prisma.chatMessage.findMany({
      where: {
        threadId: thread.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        role: true,
        content: true,
      },
    })
  ).reverse();
  const currentGoogleBusinessProfiles = (
    localGrowthEnabled ? business.googleBusinessProfiles : []
  ).map((profile) => ({
    id: profile.id,
    googlePlaceId: profile.googlePlaceId,
    displayName: profile.displayName,
    formattedAddress: profile.formattedAddress,
    phoneNumber: profile.phoneNumber,
    websiteUri: profile.websiteUri,
    googleMapsUri: profile.googleMapsUri,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    matchConfidence: profile.matchConfidence,
    matchReasons: profile.matchReasons,
    status: profile.status,
    source: profile.source,
    confirmedAt: profile.confirmedAt,
    updatedAt: profile.updatedAt,
    businessStatus: profile.businessStatus,
    primaryType: profile.primaryType,
    types: profile.types,
  }));
  const currentReviewAnalysis = localGrowthEnabled
    ? buildCurrentReviewAnalysis({
        businessProfiles: business.profiles,
        googleBusinessProfiles: currentGoogleBusinessProfiles,
        competitors: (competitorIntelligenceEnabled
          ? business.competitors
          : []
        ).map((competitor) => ({
          name: competitor.name,
          discoveredProfiles: competitor.discoveredProfiles,
        })),
        goals: business.goals,
        primaryGoal: business.primaryGoal,
        businessContext: {
          description: business.description,
          targetAudience: business.targetAudience,
          mainOffer: business.mainOffer,
          industry: business.industry,
          businessType: business.businessType,
          primaryConversionGoal: business.primaryConversionGoal,
        },
        latestAuditSnapshot: latestAudit.analysisSnapshot,
      })
    : null;
  let competitorContext = null;

  if (competitorIntelligenceEnabled) {
    try {
      competitorContext = await buildCompetitorConsultantContext({
        userId: user.id,
        businessId: business.id,
        auditId: latestAudit.id,
        diagnostics,
      });
    } catch (error) {
      return consultantFailureResult(
        new ConsultantPipelineError({
          code: "CONTEXT_FAILURE",
          stage: "COMPETITOR_CONTEXT_BUILD",
          message: "The saved competitor context could not be prepared.",
          cause: error,
        }),
        diagnostics.requestId,
      );
    }
  }

  const baseConsultantInput = {
    question,
    business: {
      id: business.id,
      name: business.name,
      initialInput: business.initialInput,
      goals: business.goals,
      primaryGoal: business.primaryGoal,
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
      brandTone: business.brandTone,
      contextConfidence: business.contextConfidence,
      contextSource: business.contextSource,
      contextConfirmedAt: business.contextConfirmedAt,
    },
    latestAudit: {
      overallScore: latestAudit.overallScore,
      summary: latestAudit.summary,
      createdAt: latestAudit.createdAt,
      analysisSnapshot: latestAudit.analysisSnapshot,
    },
    scores: latestAudit.scores.filter(
      (score) => !score.platform && isWebsiteSeoReportCategory(score.category),
    ),
    findings: latestAudit.findings.filter((finding) =>
      isWebsiteSeoCategory(finding.category),
    ),
    recommendations: latestAudit.recommendations.filter((recommendation) =>
      isWebsiteSeoCategory(recommendation.category),
    ),
    profiles: business.profiles.filter(
      (profile) => profile.platform === "WEBSITE" || socialGrowthEnabled,
    ),
    googleBusinessProfiles: currentGoogleBusinessProfiles,
    reviewAnalysis: currentReviewAnalysis,
    competitors: competitorIntelligenceEnabled ? business.competitors : [],
    auditComparison: compareAudits({
      currentAudit: latestAudit,
      previousAudit,
    }),
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    recentChatHistory,
    socialStrategy,
    competitorContext,
  };
  let consultantResponse;

  try {
    consultantResponse = await generateConsultantResponseResult(
      baseConsultantInput,
      { diagnostics },
    );
  } catch (error) {
    return consultantFailureResult(error, diagnostics.requestId);
  }

  let messages;
  try {
    messages = await persistConsultantExchange(
      {
        threadId: thread.id,
        question,
        response: consultantResponse,
      },
      { diagnostics },
    );
  } catch (error) {
    return consultantFailureResult(error, diagnostics.requestId);
  }

  return {
    messages: messages.map(toViewMessage),
    mode: "ai",
  };
}

function consultantFailureResult(
  error: unknown,
  requestId: string,
): SendChatMessageResult {
  if (!isConsultantPipelineError(error)) {
    logError("ai_consultant_unexpected_failure", error, { requestId });
  } else {
    logError("ai_consultant_pipeline_failure", error, {
      requestId,
      stage: error.stage,
      failureCode: error.code,
      transient: error.transient,
    });
  }

  return {
    messages: [],
    ...mapConsultantFailure(error),
  };
}

export async function clearChatHistory({
  businessId,
}: {
  businessId: string;
}): Promise<ClearChatHistoryResult> {
  const user = await requireUser(`/dashboard/businesses/${businessId}/chat`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    notFound();
  }

  await prisma.chatThread.deleteMany({
    where: {
      businessId,
      userId: user.id,
    },
  });

  return {
    messages: [],
    mode: isOpenAIConfigured() ? "ai" : "unavailable",
  };
}
