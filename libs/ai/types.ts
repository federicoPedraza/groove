export type ReasoningLevel = "low" | "medium" | "high";

export type ConsellourModelConfig = {
  apiKey: string;
  model: string;
  reasoningLevel: ReasoningLevel;
};

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type AiModelResult =
  | {
      kind: "final";
      text: string;
    }
  | {
      kind: "tool-calls";
      toolCalls: AiToolCall[];
      assistantText?: string;
    };

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AiModelRuntime = {
  generate: (args: {
    config: ConsellourModelConfig;
    messages: AiChatMessage[];
    tools: AiToolDefinition[];
  }) => Promise<AiModelResult>;
};
