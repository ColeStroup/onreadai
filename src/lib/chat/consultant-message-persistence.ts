import "server-only";

import { ChatRole } from "@prisma/client";

import { ConsultantPipelineError } from "@/lib/ai/consultant-errors";
import type { ConsultantResponseResult } from "@/lib/ai/openai-consultant";
import type { ConsultantDiagnostics } from "@/lib/observability/consultant-diagnostics";
import { prisma } from "@/lib/prisma";

type PersistedChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
};

type PersistenceInput = {
  threadId: string;
  question: string;
  response: ConsultantResponseResult;
};

type PersistenceOperation = (
  input: PersistenceInput,
) => Promise<PersistedChatMessage[]>;

export async function persistConsultantExchange(
  input: PersistenceInput,
  options: {
    diagnostics?: ConsultantDiagnostics;
    persist?: PersistenceOperation;
  } = {},
) {
  const diagnostics = options.diagnostics;
  diagnostics?.started("MESSAGE_PERSISTENCE", {
    responseSource: input.response.source,
  });

  try {
    const messages = await (options.persist ?? persistWithPrisma)(input);
    diagnostics?.completed("MESSAGE_PERSISTENCE", {
      responseSource: input.response.source,
      messageCount: messages.length,
    });
    return messages;
  } catch (error) {
    diagnostics?.failed("MESSAGE_PERSISTENCE", error, {
      responseSource: input.response.source,
    });
    throw new ConsultantPipelineError({
      code: "MESSAGE_PERSISTENCE_FAILURE",
      stage: "MESSAGE_PERSISTENCE",
      message: "The consultant response could not be saved.",
      cause: error,
    });
  }
}

async function persistWithPrisma({
  threadId,
  question,
  response,
}: PersistenceInput) {
  const userMessageCreatedAt = new Date();
  const assistantMessageCreatedAt = new Date(userMessageCreatedAt.getTime() + 1);
  const metadata = responseMetadata(response);

  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        threadId,
        role: ChatRole.USER,
        content: question,
        createdAt: userMessageCreatedAt,
      },
    }),
    prisma.chatMessage.create({
      data: {
        threadId,
        role: ChatRole.ASSISTANT,
        content: response.content,
        metadata,
        createdAt: assistantMessageCreatedAt,
      },
    }),
    prisma.chatThread.update({
      where: {
        id: threadId,
      },
      data: {
        updatedAt: new Date(),
      },
    }),
  ]);

  return prisma.chatMessage.findMany({
    where: {
      threadId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });
}

function responseMetadata(response: ConsultantResponseResult) {
  return {
    consultantSource: response.source,
    competitorIntent: response.competitorIntent ?? "none",
    fallbackReason: response.fallbackReason ?? "none",
    providerCalled: response.providerCalled,
    providerResponded: response.providerResponded,
    evidenceValidated: response.evidenceValidated,
  };
}
