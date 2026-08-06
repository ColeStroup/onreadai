import { AuditStatus } from "@prisma/client";
import { ArrowRight, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIntro } from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { isOpenAIConfigured } from "@/lib/ai/openai-consultant";
import { canSendAiMessage } from "@/lib/billing/entitlements";
import { contextualHelp } from "@/lib/education/help-content";
import { getSuggestedQuestionsForGoals } from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { ChatMessageView } from "@/app/dashboard/businesses/[businessId]/chat/actions";

type BusinessChatPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ prompt?: string | string[] }>;
};

export default async function BusinessChatPage({
  params,
  searchParams,
}: BusinessChatPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const initialDraft = Array.isArray(query.prompt)
    ? (query.prompt[0] ?? "")
    : (query.prompt ?? "");
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
    },
  });

  if (!business) {
    notFound();
  }

  if (business.audits.length === 0) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow="Consultant"
          title="Ask your Website & SEO Consultant"
          description="The Consultant uses your saved website evidence, SEO checks, goals, recommendations, and progress."
          icon={MessageSquareText}
        />
        <EmptyState
          compact
          icon={<MessageSquareText className="size-6" />}
          title="Run an audit before chatting"
          description="The Consultant needs a completed website audit before it can answer from saved findings, recommendations, and crawl evidence."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              data-customer-event="empty_state_action_clicked"
              data-customer-surface="empty_state"
              className={buttonVariants({ variant: "primary" })}
            >
              Run website audit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  const suggestedQuestions = [
    "What should I fix first?",
    "Explain my top issue in simple words.",
    "Can I fix my top issue myself?",
    "How will Onread check that it is fixed?",
    ...getSuggestedQuestionsForGoals(
      business.goals,
      business.primaryGoal,
      [],
      null,
      null,
      null,
      {
        description: business.description,
        targetAudience: business.targetAudience,
        businessType: business.businessType,
        primaryConversionGoal: business.primaryConversionGoal,
        contextConfirmedAt: business.contextConfirmedAt,
      },
    ),
  ].filter((question, index, all) => all.indexOf(question) === index).slice(0, 6);
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
      <PageIntro
        eyebrow="Consultant"
        title="Ask your Website & SEO Consultant"
        description="Get practical help understanding findings, prioritizing fixes, drafting improvements, and verifying the result."
        icon={MessageSquareText}
      />
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
