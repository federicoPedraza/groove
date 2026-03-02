import type { AiToolDefinition } from "../types";

export const CONSELLOUR_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: "create_task",
    description: "Create a workspace task from the Consellour tool flow.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "priority", "consellourPriority"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        consellourPriority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        origin: { type: "string", enum: ["consellourTool", "externalSync"] },
        externalId: { type: "string" },
        externalUrl: { type: "string" },
      },
    },
  },
  {
    name: "get_all_tasks",
    description: "Get all workspace tasks to inspect current actions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "get_task",
    description: "Find a task by title and/or description substring match.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        titleQuery: { type: "string" },
        descriptionQuery: { type: "string" },
      },
    },
  },
  {
    name: "get_recommended_task",
    description: "Get the next recommended workspace task.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "edit_task",
    description: "Edit an existing task in workspace storage.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        consellourPriority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        lastInteractedAt: { type: "string" },
        origin: { type: "string", enum: ["consellourTool", "externalSync"] },
        externalId: { type: "string" },
        externalUrl: { type: "string" },
      },
    },
  },
];
