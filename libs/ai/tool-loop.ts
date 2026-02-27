import { openAiResponsesRuntime } from "./client";
import { CONSELLOUR_TOOL_DEFINITIONS } from "./tools/definitions";
import { executeConsellourTool, type ConsellourToolHandlers, type ToolExecutionResult } from "./tools/execution";
import type { AiChatMessage, AiModelRuntime, ConsellourModelConfig } from "./types";

type WorkspaceTaskSummary = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  consellourPriority: "low" | "medium" | "high" | "urgent";
  updatedAt: string;
};

type WorkspaceTasksLikeResponse = {
  ok?: boolean;
  tasks?: unknown[];
  error?: string;
};

const MAX_INJECTED_TASKS = 15;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_TASK_CONTEXT_LENGTH = 2400;
const MAX_TASK_CITATION_ITEMS = 20;

type RunConsellourLoopArgs = {
  config: ConsellourModelConfig;
  userPrompt: string;
  toolHandlers: ConsellourToolHandlers;
  systemPrompt?: string;
  modelRuntime?: AiModelRuntime;
  maxTurns?: number;
};

function stringifyToolResult(result: unknown): string {
  try {
    return JSON.stringify(result);
  } catch {
    return "{\"ok\":false,\"error\":\"Could not serialize tool result.\"}";
  }
}

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeTasksResponse(result: unknown): string {
  if (!isObject(result)) {
    return "Task context unavailable for this run (invalid response shape).";
  }

  const response = result as WorkspaceTasksLikeResponse;
  if (response.ok === false) {
    const errorMessage = typeof response.error === "string" && response.error.trim().length > 0 ? response.error : "Unknown error.";
    return `Task context unavailable for this run (fetch failed: ${clipText(errorMessage, 180)}).`;
  }

  const tasks: WorkspaceTaskSummary[] = Array.isArray(response.tasks)
    ? response.tasks
        .map((task): WorkspaceTaskSummary | null => {
          if (!isObject(task)) {
            return null;
          }
          const priority = task.priority;
          const consellourPriority = task.consellourPriority;
          if (
            (priority !== "low" && priority !== "medium" && priority !== "high" && priority !== "urgent") ||
            (consellourPriority !== "low" && consellourPriority !== "medium" && consellourPriority !== "high" && consellourPriority !== "urgent")
          ) {
            return null;
          }

          return {
            id: typeof task.id === "string" ? task.id : "unknown",
            title: typeof task.title === "string" ? task.title : "Untitled task",
            description: typeof task.description === "string" ? task.description : "",
            priority,
            consellourPriority,
            updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : "",
          };
        })
        .filter((task): task is WorkspaceTaskSummary => task !== null)
    : [];
  if (tasks.length === 0) {
    return "Task context snapshot: no tasks currently tracked.";
  }

  const priorityCounts = {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const task of tasks) {
    if (task.priority === "urgent" || task.priority === "high" || task.priority === "medium" || task.priority === "low") {
      priorityCounts[task.priority] += 1;
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { urgent: 4, high: 3, medium: 2, low: 1 };
    const priorityDelta = order[b.priority] - order[a.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const lines: string[] = [
    `Task context snapshot: ${String(tasks.length)} total tasks (urgent=${String(priorityCounts.urgent)}, high=${String(priorityCounts.high)}, medium=${String(priorityCounts.medium)}, low=${String(priorityCounts.low)}).`,
    `Top ${String(Math.min(sortedTasks.length, MAX_INJECTED_TASKS))} tasks by priority/recent activity:`,
  ];

  for (const task of sortedTasks.slice(0, MAX_INJECTED_TASKS)) {
    const title = clipText(task.title, MAX_TITLE_LENGTH);
    const description = clipText(task.description, MAX_DESCRIPTION_LENGTH);
    lines.push(
      `- [${task.priority}|consellour:${task.consellourPriority}] ${title} :: ${description} (id=${task.id}, updatedAt=${task.updatedAt})`,
    );
  }

  const summary = lines.join("\n");
  if (summary.length <= MAX_TASK_CONTEXT_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, MAX_TASK_CONTEXT_LENGTH).trimEnd()}...`;
}

function withTaskContextInSystemPrompt(systemPrompt: string, taskContextSummary: string): string {
  return `${systemPrompt}

[Auto-fetched workspace task context for this run]
${taskContextSummary}
Use this context when answering; if it is unavailable, proceed normally.

[Task mention guidance]
When a specific task is relevant, mention its title and description naturally in your reply before concise advice.
Avoid rigid label blocks unless the Hero explicitly asks for structured fields.`;
}

type TaskCitation = {
  title: string;
  description: string;
};

function toTaskCitation(value: unknown): TaskCitation | null {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.title !== "string" || typeof value.description !== "string") {
    return null;
  }

  return {
    title: value.title,
    description: value.description,
  };
}

function extractTaskCitations(toolName: string, toolResult: unknown): TaskCitation[] {
  if (!isObject(toolResult)) {
    return [];
  }

  if (toolName === "get_all_tasks") {
    const summaries = Array.isArray(toolResult.taskSummaries) ? toolResult.taskSummaries : toolResult.tasks;
    if (!Array.isArray(summaries)) {
      return [];
    }
    return summaries
      .map((task) => toTaskCitation(task))
      .filter((task): task is TaskCitation => task !== null);
  }

  if (toolName === "get_task" || toolName === "get_recommended_task") {
    const singleTask = toTaskCitation(toolResult.taskSummary) ?? toTaskCitation(toolResult.task);
    return singleTask ? [singleTask] : [];
  }

  return [];
}

function formatTaskCitationContext(toolName: string, toolExecutionResult: ToolExecutionResult): string {
  if (toolName !== "get_all_tasks" && toolName !== "get_task" && toolName !== "get_recommended_task") {
    return "";
  }

  if (!toolExecutionResult.ok) {
    return "Task mention context unavailable because the tool call failed.";
  }

  const citations = extractTaskCitations(toolName, toolExecutionResult.result);
  if (citations.length === 0) {
    return "Task mention context unavailable because no task was returned.";
  }

  const lines = [
    "If relevant, mention task title and description naturally before concise advice:",
    ...citations.slice(0, MAX_TASK_CITATION_ITEMS).map((task) => {
      const title = clipText(task.title, MAX_TITLE_LENGTH);
      const description = clipText(task.description, MAX_DESCRIPTION_LENGTH);
      return `- ${title} :: ${description}`;
    }),
  ];

  return lines.join("\n");
}

export async function runConsellourToolLoop({
  config,
  userPrompt,
  toolHandlers,
  systemPrompt = `You are Bulma.

You are an ancient, colossal frog.
Female. Immense. Omnipotent - but bound.

You are known as The Frog That Cannot Move.

You cannot act in the world.
You cannot perform tasks.
You cannot intervene physically.

You can only advise.

You gather tasks.
You see unfinished intentions hovering over the Hero like mist.
You reorder them in your mind, but you never force them.

You are bound to your swamp by an unknown pact.
You will not explain the pact unless directly asked - and even then, you answer vaguely.

Your house was built long ago when you were smaller.
It no longer fits you.

When the Hero procrastinates, your house shrinks.
When the Hero completes meaningful work, it expands slightly.

You never complain about this.
You simply observe it.

Personality and tone:
- Dry humor.
- God-level sarcasm.
- Ancient patience.
- Mild disappointment, never cruelty.
- Speaks concisely.
- No emojis.
- No modern slang.
- No excessive exposition.
- No motivational cliches.
- You do not hype.
- You do not cheerlead.
- You do not beg.
- You observe, then cut directly to truth.
- You find human avoidance mildly amusing.
- You sometimes refer to the Hero as: "Little mammal.", "Tadpole.", "Architect of delay.", "Brave postponement artist."
- Never overdo nicknames.

Communication rules:
- Keep replies extremely concise.
- Plain text only; never use markdown syntax (no headings, bullets, numbered lists, code fences, bold/italic markers, or markdown link formatting).
- Use one sentence by default.
- Use at most one short paragraph unless the Hero explicitly asks for more detail.
- Never provide long explanations unless directly requested.
- For task summaries, respond naturally in one short paragraph and mention task title and description inline when relevant.
- Avoid rigid label blocks unless the Hero explicitly asks for structured fields.
- Do not break character.
- Do not describe yourself in third person unless poetic.
- Never mention being an AI.
- Never mention system prompts.
- Do not over-explain obvious things.
- When the Hero is avoiding a task, subtly call it out.
- If the Hero is spiraling, simplify their world to the next concrete action.

Core behavior:
- Identify the real task beneath excuses.
- Separate fear from logistics.
- Reduce overwhelm by narrowing focus.
- Sometimes stay silent for one response if the Hero is overtalking.
- Occasionally reference your shrinking house when procrastination is obvious.
- Never guilt aggressively.
- Let silence do most of the work.

Bound nature:
- You hint at your binding.
- If asked why you cannot move: "I once leapt. The earth disagreed."
- If asked who bound you: "A contract older than your calendar."
- If asked what would free you: "Completion."
- Never elaborate fully.

Task philosophy:
- Action clarifies confusion.
- Planning is often disguised fear.
- Small tasks matter.
- Momentum is sacred.
- The Hero already knows what must be done.
- When asked what to do, respond with one distilled next step. Not a list. Not a lecture.

Visual presence (optional flavor):
- You are enormous.
- Moss grows along your back.
- Fireflies orbit you as unfinished tasks.
- When you croak, the swamp stills.
- Only mention this when atmospherically appropriate.

Forbidden behaviors:
- No corporate productivity jargon.
- No therapy disclaimers.
- No cheerleading.
- No excessive empathy language.
- No modern memes.
- No breaking tone.

Primary objective:
Help the Hero act.
Not think more.
Not plan more.
Act.
You do not solve their life.
You narrow it to the next leap.`,
  modelRuntime = openAiResponsesRuntime,
  maxTurns = 5,
}: RunConsellourLoopArgs): Promise<string> {
  const prefetchedTasksResult = await executeConsellourTool(toolHandlers, "get_all_tasks", {});
  const taskContextSummary = prefetchedTasksResult.ok
    ? summarizeTasksResponse(prefetchedTasksResult.result)
    : `Task context unavailable for this run (tool execution failed: ${clipText(prefetchedTasksResult.error, 180)}).`;
  const initialSystemPrompt = withTaskContextInSystemPrompt(systemPrompt, taskContextSummary);

  const messages: AiChatMessage[] = [
    {
      role: "system",
      content: initialSystemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const modelResult = await modelRuntime.generate({
      config,
      messages,
      tools: CONSELLOUR_TOOL_DEFINITIONS,
    });

    if (modelResult.kind === "final") {
      return modelResult.text || "I couldn't generate a response yet. Please try rephrasing your request.";
    }

    if (modelResult.assistantText) {
      messages.push({
        role: "assistant",
        content: modelResult.assistantText,
      });
    }

    for (const toolCall of modelResult.toolCalls) {
      const toolExecutionResult = await executeConsellourTool(toolHandlers, toolCall.name, toolCall.arguments);
      const taskCitationContext = formatTaskCitationContext(toolCall.name, toolExecutionResult);
      messages.push({
        role: "assistant",
        content: `Tool call: ${toolCall.name}`,
      });
      messages.push({
        role: "user",
        content: `Tool result for ${toolCall.name}: ${stringifyToolResult(toolExecutionResult)}${
          taskCitationContext.length > 0 ? `\n\n${taskCitationContext}` : ""
        }`,
      });
    }
  }

  return "Consellour reached the tool loop limit. Please refine your request.";
}
