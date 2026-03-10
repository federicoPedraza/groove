import { buildHelpGroundingContext, createHelpQueryEmbedding, retrieveHelpChunks, type HelpChunkMatch } from "@/libs/help/retrieval";

export type HelpChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type HelpChatResponse = {
  answer: string;
  chunks: HelpChunkMatch[];
};

type HelpResponsesApiTextPart = {
  type?: string;
  text?: string | { value?: string };
  value?: string;
};

type HelpResponsesApiMessage = {
  type?: string;
  content?: string | HelpResponsesApiTextPart[];
};

type HelpResponsesApiResult = {
  output_text?: string;
  output?: unknown[];
};

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_HISTORY_ITEMS = 8;
const MAX_CONTEXT_CHUNKS = 6;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextPart(part: unknown): string {
  if (!isObject(part)) {
    return "";
  }

  const maybePart = part as HelpResponsesApiTextPart;
  if (typeof maybePart.type !== "string" || (maybePart.type !== "output_text" && maybePart.type !== "text")) {
    return "";
  }

  if (typeof maybePart.text === "string") {
    return maybePart.text.trim();
  }

  if (isObject(maybePart.text) && typeof maybePart.text.value === "string") {
    return maybePart.text.value.trim();
  }

  if (typeof maybePart.value === "string") {
    return maybePart.value.trim();
  }

  return "";
}

function extractTextFromOutput(responseOutput: unknown[]): string {
  const chunks: string[] = [];

  for (const item of responseOutput) {
    if (!isObject(item)) {
      continue;
    }

    const directText = extractTextPart(item);
    if (directText.length > 0) {
      chunks.push(directText);
      continue;
    }

    const maybeMessage = item as HelpResponsesApiMessage;
    if (maybeMessage.type !== "message") {
      continue;
    }

    if (typeof maybeMessage.content === "string") {
      const contentText = maybeMessage.content.trim();
      if (contentText.length > 0) {
        chunks.push(contentText);
      }
      continue;
    }

    if (!Array.isArray(maybeMessage.content)) {
      continue;
    }

    for (const part of maybeMessage.content) {
      const partText = extractTextPart(part);
      if (partText.length > 0) {
        chunks.push(partText);
      }
    }
  }

  return chunks.join("\n\n").trim();
}

export async function runHelpChatTurn({
  apiKey,
  model,
  reasoningLevel,
  history,
  prompt,
}: {
  apiKey: string;
  model: string;
  reasoningLevel: "low" | "medium" | "high";
  history: HelpChatMessage[];
  prompt: string;
}): Promise<HelpChatResponse> {
  const queryEmbedding = await createHelpQueryEmbedding(apiKey, prompt);
  const retrievedChunks = retrieveHelpChunks({
    query: prompt,
    queryEmbedding,
    limit: MAX_CONTEXT_CHUNKS,
  });

  const groundingContext = buildHelpGroundingContext(retrievedChunks);
  const historyWindow = history.slice(Math.max(0, history.length - MAX_HISTORY_ITEMS));

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      reasoning: {
        effort: reasoningLevel,
      },
      input: [
        {
          role: "system",
          content: `You are Groove Help.

Use retrieved feature documentation as your primary source of truth.
When docs and memory conflict, prefer docs.
If context is missing, say what is missing instead of inventing details.
Keep answers concise and practical.

Retrieved documentation context:
${groundingContext}`,
        },
        ...historyWindow.map((message) => ({
          role: message.role,
          content: message.text,
        })),
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${String(response.status)}): ${errorBody}`);
  }

  const payload = (await response.json()) as HelpResponsesApiResult;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const answer = (typeof payload.output_text === "string" ? payload.output_text.trim() : "") || extractTextFromOutput(output);

  return {
    answer: answer.length > 0 ? answer : "I could not draft an answer yet. Please try rephrasing your question.",
    chunks: retrievedChunks,
  };
}
