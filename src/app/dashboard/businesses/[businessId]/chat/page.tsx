import { AuditStatus, CompetitorStatus } from "@prisma/client";
import { ArrowRight, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  normalizeReviewAnalysisForDisplay,
  type ReviewAnalysis,
} from "@/lib/analyzers/review-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import {
  buildCompetitorConsultantContext,
  getCompetitorSuggestedQuestions,
} from "@/lib/ai/competitor-consultant-context";
import { isOpenAIConfigured } from "@/lib/ai/openai-consultant";
import { canSendAiMessage } from "@/lib/billing/entitlements";
import { contextualHelp } from "@/lib/education/help-content";
import { getSuggestedQuestionsForGoals } from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseSocialStrategy } from "@/lib/social-strategy";
import type { ChatMessageView } from "@/app/dashboard/businesses/[businessId]/chat/actions";

type BusinessChatPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ prompt?: string | string[] }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getSocialAnalysis(snapshot: unknown): SocialAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.social)) {
    return null;
  }

  const social = snapshot.social;

  if (
    typeof social.score !== "number" ||
    !Array.isArray(social.confirmedPlatforms)
  ) {
    return null;
  }

  return social as SocialAnalysis;
}

function getReviewAnalysis(snapshot: unknown): ReviewAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.reviews)) {
    return null;
  }

  const reviews = snapshot.reviews;

  if (
    typeof reviews.score !== "number" ||
    !Array.isArray(reviews.confirmedReviewPlatforms)
  ) {
    return null;
  }

  return normalizeReviewAnalysisForDisplay(reviews as ReviewAnalysis);
}

export default async function BusinessChatPage({
  params,
  searchParams,
}: BusinessChatPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const initialDraft = Array.isArray(query.prompt)
    ? query.prompt[0] ?? ""
    : query.prompt ?? "";
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
        take: 1,
        select: {
          id: true,
          analysisSnapshot: true,
        },
      },
      chatThreads: {
        where: {
          userId: user.id,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
      competitors: {
        where: {
          status: CompetitorStatus.ACTIVE,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          name: true,
        },
      },
      socialStrategies: {
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

  if (business.audits.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareText className="size-6" />}
        title="Run an audit before chatting with your AI consultant."
        description="Run an audit first so the consultant can reference scores, findings, recommendations, and confirmed profiles."
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/confirm`}
            className={buttonVariants({ variant: "primary" })}
          >
            Run Audit
            <ArrowRight className="size-4" />
          </Link>
        }
      />
    );
  }

  const latestAudit = business.audits.at(0);
  const social = latestAudit
    ? getSocialAnalysis(latestAudit.analysisSnapshot)
    : null;
  const reviews = latestAudit
    ? getReviewAnalysis(latestAudit.analysisSnapshot)
    : null;
  const socialStrategy = parseSocialStrategy(business.socialStrategies.at(0));
  const competitorContext = await buildCompetitorConsultantContext({
    userId: user.id,
    businessId: business.id,
    auditId: latestAudit?.id,
  });
  const strategyQuestions = socialStrategy
    ? [
        socialStrategy.recommendedPlatforms.at(0)
          ? `Should I focus on ${socialStrategy.recommendedPlatforms[0].platform} first?`
          : null,
        "What should I post this week?",
        "Give me 5 content ideas.",
        "How do I turn views into signups?",
      ].filter((question): question is string => Boolean(question))
    : [];
  const suggestedQuestions = [
    ...strategyQuestions,
    ...getCompetitorSuggestedQuestions(competitorContext),
    ...getSuggestedQuestionsForGoals(
      business.goals,
      business.primaryGoal,
      business.competitors.map((competitor) => competitor.name),
      social?.score,
      reviews?.score,
      reviews?.googleBusinessStatus,
      {
        description: business.description,
        targetAudience: business.targetAudience,
        businessType: business.businessType,
        primaryConversionGoal: business.primaryConversionGoal,
        contextConfirmedAt: business.contextConfirmedAt,
      },
    ),
  ]
    .filter((question, index, questions) => questions.indexOf(question) === index)
    .slice(0, 6);
  const initialMessages: ChatMessageView[] =
    business.chatThreads.at(0)?.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })) ?? [];
  const aiMessageCheck = await canSendAiMessage(user.id);
  const aiConfigured = isOpenAIConfigured();

  return (
    <div id="chat-page-top" className="space-y-6">
      <ContextualHelpCard {...contextualHelp.chat} />
      <ChatPanel
        businessId={business.id}
        initialMessages={initialMessages}
        initialMode={aiConfigured ? "ai" : "unavailable"}
        suggestedQuestions={suggestedQuestions}
        initialDraft={initialDraft}
        canSend={aiConfigured && aiMessageCheck.allowed}
        sendDisabledReason={
          aiConfigured
            ? aiMessageCheck.reason
            : "The AI Consultant is not configured for this environment."
        }
      />
    </div>
  );
}
