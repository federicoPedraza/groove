# Tasks and Consellour

## Purpose
The Tasks page is managed through Consellour chat and tools. Use it to create, update, recommend, and review workspace tasks with consistent priority metadata.

## Prerequisites
Consellour requires an OpenAI API key in workspace settings. Without a key, chat can load but tool-driven task operations are blocked.

## Chat behavior
When you send a prompt, Consellour may call task tools such as create, get, edit, and recommend. Responses are concise and grounded in the latest workspace task list.

## Task quality guidance
Write clear titles, concrete descriptions, and realistic priority levels. Keep one task per outcome so the recommendation flow can surface the next best item.

## Jira integration link
If Jira is connected, sync operations can import and update task metadata. Review imported descriptions before using them in execution plans.
