import "server-only";

import OpenAI from "openai";

export const defaultOpenAIModel = "gpt-5.4-mini";

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || defaultOpenAIModel;
}

export function getOpenAIClient({
  maxRetries = 1,
  timeout = 30_000,
}: {
  maxRetries?: number;
  timeout?: number;
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("The AI provider is not configured.");
  }

  return new OpenAI({
    apiKey,
    maxRetries,
    timeout,
  });
}
