import type { AiChatMessage, AiModelResult, AiModelRuntime, AiToolCall, AiToolDefinition } from "./types";

type ResponsesApiFunctionCall = {
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  type?: string;
};

type ResponsesApiTextPart = {
  type?: string;
  text?: string | { value?: string };
  value?: string;
};

type ResponsesApiMessage = {
  type?: string;
  content?: string | ResponsesApiTextPart[];
};

type ResponsesApiResult = {
  output_text?: string;
  output?: unknown[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toToolCalls(responseOutput: unknown[]): AiToolCall[] {
  const toolCalls: AiToolCall[] = [];
  for (const item of responseOutput) {
    if (!isObject(item)) {
      continue;
    }
    const maybeFunctionCall = item as ResponsesApiFunctionCall;
    if (maybeFunctionCall.type !== "function_call" || typeof maybeFunctionCall.name !== "string") {
      continue;
    }

    let parsedArguments: unknown = {};
    if (typeof maybeFunctionCall.arguments === "string" && maybeFunctionCall.arguments.trim().length > 0) {
      try {
        parsedArguments = JSON.parse(maybeFunctionCall.arguments);
      } catch {
        parsedArguments = {};
      }
    }

    toolCalls.push({
      id: maybeFunctionCall.call_id ?? maybeFunctionCall.id ?? crypto.randomUUID(),
      name: maybeFunctionCall.name,
      arguments: parsedArguments,
    });
  }

  return toolCalls;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractTextPart(part: unknown): string {
  if (!isObject(part)) {
    return "";
  }

  const maybePart = part as ResponsesApiTextPart;
  const textType = typeof maybePart.type === "string" ? maybePart.type : "";
  if (textType !== "output_text" && textType !== "text") {
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

    const maybeMessage = item as ResponsesApiMessage;
    if (maybeMessage.type !== "message") {
      continue;
    }

    if (typeof maybeMessage.content === "string") {
      const messageText = maybeMessage.content.trim();
      if (messageText.length > 0) {
        chunks.push(messageText);
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

function toResponsesInput(messages: AiChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function toResponsesTools(tools: AiToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export const openAiResponsesRuntime: AiModelRuntime = {
  async generate({ config, messages, tools }): Promise<AiModelResult> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        reasoning: {
          effort: config.reasoningLevel,
        },
        input: toResponsesInput(messages),
        tools: toResponsesTools(tools),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed (${String(response.status)}): ${errorBody}`);
    }

    const payload = (await response.json()) as ResponsesApiResult;
    const output = Array.isArray(payload.output) ? payload.output : [];
    const text = normalizeText(payload.output_text) || extractTextFromOutput(output);
    const toolCalls = toToolCalls(output);

    if (toolCalls.length > 0) {
      return {
        kind: "tool-calls",
        toolCalls,
        assistantText: text.length > 0 ? text : undefined,
      };
    }

    return {
      kind: "final",
      text,
    };
  },
};
