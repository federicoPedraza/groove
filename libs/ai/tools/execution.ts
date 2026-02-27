import type {
  ConsellourToolCreateTaskPayload,
  ConsellourToolEditTaskPayload,
  WorkspaceTaskQueryPayload,
  WorkspaceTasksResponse,
  WorkspaceTaskResponse,
} from "../../../src/lib/ipc";

type ToolName = "create_task" | "get_all_tasks" | "get_task" | "get_recommended_task" | "edit_task";

type ToolExecutionOk = {
  ok: true;
  result: unknown;
};

type ToolExecutionError = {
  ok: false;
  error: string;
};

export type ToolExecutionResult = ToolExecutionOk | ToolExecutionError;

export type ConsellourToolHandlers = {
  createTask: (payload: ConsellourToolCreateTaskPayload) => Promise<WorkspaceTaskResponse>;
  getAllTasks: () => Promise<WorkspaceTasksResponse>;
  getTask: (payload: WorkspaceTaskQueryPayload) => Promise<WorkspaceTaskResponse>;
  getRecommendedTask: () => Promise<WorkspaceTaskResponse>;
  editTask: (payload: ConsellourToolEditTaskPayload) => Promise<WorkspaceTaskResponse>;
};

type SafeToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
};

type NormalizedTaskSummary = {
  id: string;
  title: string;
  description: string;
};

const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const TASK_ORIGINS = new Set(["consellourTool", "externalSync"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function asRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function asOptionalTaskPriority(value: unknown): "low" | "medium" | "high" | "urgent" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (!TASK_PRIORITIES.has(value)) {
    throw new Error("priority must be one of low, medium, high, urgent.");
  }
  return value as "low" | "medium" | "high" | "urgent";
}

function asOptionalTaskOrigin(value: unknown): "consellourTool" | "externalSync" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (!TASK_ORIGINS.has(value)) {
    throw new Error("origin must be one of consellourTool, externalSync.");
  }
  return value as "consellourTool" | "externalSync";
}

function parseToolCall(name: string, argumentsValue: unknown): SafeToolCall {
  if (!isObject(argumentsValue)) {
    throw new Error("Tool call arguments must be an object.");
  }

  if (
    name !== "create_task" &&
    name !== "get_all_tasks" &&
    name !== "get_task" &&
    name !== "get_recommended_task" &&
    name !== "edit_task"
  ) {
    throw new Error(`Unsupported tool ${name}.`);
  }

  return {
    name,
    arguments: argumentsValue,
  };
}

function toTaskSummary(task: WorkspaceTaskResponse["task"]): NormalizedTaskSummary | undefined {
  if (!task) {
    return undefined;
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
  };
}

export async function executeConsellourTool(
  handlers: ConsellourToolHandlers,
  toolName: string,
  argumentsValue: unknown,
): Promise<ToolExecutionResult> {
  try {
    const parsedToolCall = parseToolCall(toolName, argumentsValue);

    switch (parsedToolCall.name) {
      case "create_task": {
        const payload: ConsellourToolCreateTaskPayload = {
          title: asRequiredString(parsedToolCall.arguments.title, "title"),
          description: asRequiredString(parsedToolCall.arguments.description, "description"),
          priority: asOptionalTaskPriority(parsedToolCall.arguments.priority) ?? "medium",
          consellourPriority: asOptionalTaskPriority(parsedToolCall.arguments.consellourPriority) ?? "medium",
          origin: asOptionalTaskOrigin(parsedToolCall.arguments.origin),
          externalId: asOptionalString(parsedToolCall.arguments.externalId),
          externalUrl: asOptionalString(parsedToolCall.arguments.externalUrl),
        };
        return {
          ok: true,
          result: await handlers.createTask(payload),
        };
      }
      case "get_all_tasks": {
        const response = await handlers.getAllTasks();
        return {
          ok: true,
          result: {
            ...response,
            taskSummaries: response.tasks.map((task) => ({
              id: task.id,
              title: task.title,
              description: task.description,
            })),
          },
        };
      }
      case "get_task": {
        const payload: WorkspaceTaskQueryPayload = {
          titleQuery: asOptionalString(parsedToolCall.arguments.titleQuery),
          descriptionQuery: asOptionalString(parsedToolCall.arguments.descriptionQuery),
        };
        const response = await handlers.getTask(payload);
        const taskSummary = toTaskSummary(response.task);
        return {
          ok: true,
          result: {
            ...response,
            taskSummary,
            id: taskSummary?.id,
            title: taskSummary?.title,
            description: taskSummary?.description,
          },
        };
      }
      case "get_recommended_task": {
        const response = await handlers.getRecommendedTask();
        const taskSummary = toTaskSummary(response.task);
        return {
          ok: true,
          result: {
            ...response,
            taskSummary,
            id: taskSummary?.id,
            title: taskSummary?.title,
            description: taskSummary?.description,
          },
        };
      }
      case "edit_task": {
        const payload: ConsellourToolEditTaskPayload = {
          id: asRequiredString(parsedToolCall.arguments.id, "id"),
          title: asOptionalString(parsedToolCall.arguments.title),
          description: asOptionalString(parsedToolCall.arguments.description),
          priority: asOptionalTaskPriority(parsedToolCall.arguments.priority),
          consellourPriority: asOptionalTaskPriority(parsedToolCall.arguments.consellourPriority),
          lastInteractedAt: asOptionalString(parsedToolCall.arguments.lastInteractedAt),
          origin: asOptionalTaskOrigin(parsedToolCall.arguments.origin),
          externalId: asOptionalString(parsedToolCall.arguments.externalId),
          externalUrl: asOptionalString(parsedToolCall.arguments.externalUrl),
        };

        return {
          ok: true,
          result: await handlers.editTask(payload),
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown tool execution error.",
    };
  }
}
