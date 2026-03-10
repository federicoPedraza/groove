"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, RefreshCw, Settings2, Sparkles, Trash2, X } from "lucide-react";

import { runConsellourToolLoop } from "@/libs/ai";
import { EditTaskModal } from "@/components/edit-task-modal";
import { JiraIntegrationPanel } from "@/components/jira/jira-integration-panel";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import { useAppLayout } from "@/components/pages/use-app-layout";
import { ConsellourSettingsModal } from "@/components/consellour-settings-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  consellourGetRecommendedTask,
  consellourGetSettings,
  consellourGetTask,
  consellourToolCreateTask,
  consellourToolDeleteTask,
  consellourToolEditTask,
  consellourUpdateSettings,
  jiraConnectApiToken,
  jiraConnectionStatus,
  jiraDisconnect,
  jiraSyncPull,
  tasksList,
  type ConsellourSettings,
  type JiraSettings,
  type TaskOrigin,
  type TaskPriority,
  type WorkspaceTask,
} from "@/src/lib/ipc";

type ChatRow = {
  role: "user" | "assistant";
  text: string;
};

const CONSSELLOUR_GREETINGS = [
  "Hi mammal.",
  "Hello traveler.",
  "[sigh] You again.",
  "Little man, you made it.",
  "Ah. My favorite human.",
  "Greetings, adventurer.",
  "Well well, troublemaker.",
  "Hey captain.",
  "Hello, mortal project manager.",
  "Hi mammal. I am awake.",
  "Welcome back, traveler.",
  "Oh hey, little man.",
  "[dramatic sigh] I am listening.",
  "Hello genius-in-progress.",
  "Hi friend. Brains are online.",
  "Welcome back. Keep it sharp.",
  "Hey you. Yes, you.",
  "Ah, my favorite mammal.",
  "Hello traveler. Stay focused.",
  "Little man, no excuses.",
  "Hi again. Deadlines fear me.",
  "You return. Excellent.",
  "Hey captain. I am ready.",
  "Hello there. We continue.",
  "Hi mammal. Choose motion.",
  "Welcome, traveler. No dithering.",
  "[sigh] Fine. Let us work.",
  "Little man, I am listening.",
  "Hello, organizer of chaos.",
  "Hi friend. Keep it clean.",
  "Hey, legend.",
  "Greetings, tiny commander.",
  "Hello traveler. Breathe and act.",
  "Hi mammal. Bring the mess.",
  "Oh, it is you. Good.",
  "Hey little man. Stay concise.",
  "Welcome back, human.",
  "Hi there. Precision first.",
  "Hello traveler. Time to move.",
  "Bulma is present.",
] as const;

function getInitialGreeting(): string {
  const index = Math.floor(Math.random() * CONSSELLOUR_GREETINGS.length);
  return CONSSELLOUR_GREETINGS[index] ?? "Hi mammal.";
}

function TypewriterText({ text, animate, onProgress }: { text: string; animate: boolean; onProgress?: () => void }) {
  const [visibleText, setVisibleText] = useState<string>(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setVisibleText(text);
      onProgress?.();
      return;
    }

    let currentIndex = 0;
    setVisibleText("");
    const step = Math.max(1, Math.ceil(text.length / 80));
    const intervalId = window.setInterval(() => {
      currentIndex = Math.min(text.length, currentIndex + step);
      setVisibleText(text.slice(0, currentIndex));
      onProgress?.();
      if (currentIndex >= text.length) {
        window.clearInterval(intervalId);
      }
    }, 20);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [animate, onProgress, text]);

  return <p className="whitespace-pre-wrap">{visibleText}</p>;
}

const TASK_PRIORITY_BADGE_CLASSES: Record<TaskPriority, string> = {
  low: "border-green-700/30 bg-green-500/15 text-green-800 dark:border-green-400/70 dark:text-white",
  medium: "border-yellow-700/35 bg-yellow-500/15 text-yellow-900 dark:border-yellow-400/70 dark:text-white",
  high: "border-orange-700/35 bg-orange-500/15 text-orange-900 dark:border-orange-400/70 dark:text-white",
  urgent: "border-rose-700/35 bg-rose-500/15 text-rose-900 dark:border-rose-400/70 dark:text-white",
};

function getTaskPriorityBadgeClasses(priority: TaskPriority): string {
  return TASK_PRIORITY_BADGE_CLASSES[priority];
}

const TASK_PRIORITY_FILTER_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const TASK_ORIGIN_FILTER_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All origins" },
  { value: "consellourTool", label: "Consellour" },
  { value: "externalSync", label: "External sync" },
];

const TASK_ORDER_OPTIONS: DropdownOption[] = [
  { value: "updatedDesc", label: "Updated (newest)" },
  { value: "updatedAsc", label: "Updated (oldest)" },
  { value: "priorityDesc", label: "Priority (highest)" },
  { value: "priorityAsc", label: "Priority (lowest)" },
  { value: "nameAsc", label: "Name (A-Z)" },
  { value: "nameDesc", label: "Name (Z-A)" },
];

const TASK_PRIORITY_SORT_WEIGHT: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

type TaskPriorityFilter = "all" | TaskPriority;
type TaskOriginFilter = "all" | TaskOrigin;
type TaskOrder = (typeof TASK_ORDER_OPTIONS)[number]["value"];

function getTaskOriginLabel(origin: TaskOrigin): string {
  return origin === "externalSync" ? "External sync" : "Consellour";
}

function getTaskTimestampValue(timestamp: string): number {
  const parsedTimestamp = Date.parse(timestamp);
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
}

export default function TasksPage() {
  const {
    activeWorkspace,
    isBusy,
    isWorkspaceHydrating,
    statusMessage,
    errorMessage,
    pickDirectory,
    openRecentDirectory,
  } = useDashboardState();

  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [recommendedTaskId, setRecommendedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatRows, setChatRows] = useState<ChatRow[]>(() => [{ role: "assistant", text: getInitialGreeting() }]);
  const [isConsellourVisible, setIsConsellourVisible] = useState(false);
  const [isConsellourRunning, setIsConsellourRunning] = useState(false);
  const [consellourSettings, setConsellourSettings] = useState<ConsellourSettings | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const [jiraSettings, setJiraSettings] = useState<JiraSettings | null>(null);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [jiraStatusMessage, setJiraStatusMessage] = useState<string | null>(null);
  const [jiraErrorMessage, setJiraErrorMessage] = useState<string | null>(null);
  const [isJiraConnectPending, setIsJiraConnectPending] = useState(false);
  const [isJiraDisconnectPending, setIsJiraDisconnectPending] = useState(false);
  const [isJiraSyncPending, setIsJiraSyncPending] = useState(false);
  const [editingTask, setEditingTask] = useState<WorkspaceTask | null>(null);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);
  const [removeTaskTarget, setRemoveTaskTarget] = useState<WorkspaceTask | null>(null);
  const [isRemovingTask, setIsRemovingTask] = useState(false);
  const [removeTaskError, setRemoveTaskError] = useState<string | null>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<TaskPriorityFilter>("all");
  const [taskOriginFilter, setTaskOriginFilter] = useState<TaskOriginFilter>("all");
  const [taskOrder, setTaskOrder] = useState<TaskOrder>("updatedDesc");

  useAppLayout({
    noDirectoryOpenState: {
      isVisible: !isWorkspaceHydrating && !activeWorkspace,
      isBusy,
      statusMessage,
      errorMessage,
      onSelectDirectory: pickDirectory,
      onOpenRecentDirectory: openRecentDirectory,
    },
  });

  const refreshData = useCallback(async () => {
      if (!activeWorkspace) {
      setTasks([]);
      setSelectedTaskId(null);
      setRecommendedTaskId(null);
        setConsellourSettings(null);
        setJiraSettings(null);
        setJiraConnected(false);
        return;
      }

    setIsLoading(true);
    setLoadError(null);
    try {
      const [tasksResult, settingsResult, recommendedResult, jiraStatus] = await Promise.all([
        tasksList(),
        consellourGetSettings(),
        consellourGetRecommendedTask(),
        jiraConnectionStatus(),
      ]);

      if (!tasksResult.ok) {
        setLoadError(tasksResult.error ?? "Failed to load tasks.");
        setTasks([]);
      } else {
        setTasks(tasksResult.tasks);
        setSelectedTaskId((current) => {
          if (current && tasksResult.tasks.some((task) => task.id === current)) {
            return current;
          }
          return tasksResult.tasks[0]?.id ?? null;
        });
      }

      if (settingsResult.ok && settingsResult.settings) {
        setConsellourSettings(settingsResult.settings);
      }

      if (jiraStatus.ok) {
        setJiraConnected(jiraStatus.connected);
        setJiraSettings(jiraStatus.settings ?? null);
      }

      setRecommendedTaskId(recommendedResult.ok ? (recommendedResult.task?.id ?? null) : null);
    } catch {
      setLoadError("Failed to load task data.");
      setTasks([]);
      setConsellourSettings(null);
      setJiraSettings(null);
      setJiraConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const runConsellour = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || isConsellourRunning) {
      return;
    }

    if (!consellourSettings?.openaiApiKey) {
      setChatRows((current) => [
        ...current,
        { role: "assistant", text: "Add an OpenAI key in Consellour settings before starting chat." },
      ]);
      return;
    }

    setIsConsellourRunning(true);
    setChatRows((current) => [...current, { role: "user", text: prompt }]);
    setChatInput("");

    try {
      const responseText = await runConsellourToolLoop({
        config: {
          apiKey: consellourSettings.openaiApiKey,
          model: consellourSettings.model,
          reasoningLevel: consellourSettings.reasoningLevel,
        },
        userPrompt: prompt,
        toolHandlers: {
          createTask: consellourToolCreateTask,
          getAllTasks: tasksList,
          getTask: consellourGetTask,
          getRecommendedTask: consellourGetRecommendedTask,
          editTask: consellourToolEditTask,
        },
      });

      setChatRows((current) => [...current, { role: "assistant", text: responseText }]);
      await refreshData();
    } catch (error) {
      setChatRows((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "Consellour could not complete the request.",
        },
      ]);
    } finally {
      setIsConsellourRunning(false);
    }
  }, [chatInput, consellourSettings, isConsellourRunning, refreshData]);

  const scrollChatToBottom = useCallback(() => {
    if (!chatHistoryRef.current) {
      return;
    }
    chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    scrollChatToBottom();
  }, [chatRows.length, scrollChatToBottom]);

  const visibleTasks = useMemo<WorkspaceTask[]>(() => {
    const normalizedSearchQuery = taskSearchQuery.trim().toLowerCase();

    const searchedTasks = normalizedSearchQuery.length
      ? tasks.filter((task) => {
          return [task.title, task.origin, getTaskOriginLabel(task.origin)].some((candidate) =>
            candidate.toLowerCase().includes(normalizedSearchQuery),
          );
        })
      : tasks;

    const filteredTasks = searchedTasks.filter((task) => {
      if (taskPriorityFilter !== "all" && task.priority !== taskPriorityFilter) {
        return false;
      }

      if (taskOriginFilter !== "all" && task.origin !== taskOriginFilter) {
        return false;
      }

      return true;
    });

    const sortedTasks = [...filteredTasks];
    sortedTasks.sort((leftTask, rightTask) => {
      switch (taskOrder) {
        case "updatedAsc":
          return getTaskTimestampValue(leftTask.updatedAt) - getTaskTimestampValue(rightTask.updatedAt);
        case "priorityDesc":
          return TASK_PRIORITY_SORT_WEIGHT[rightTask.priority] - TASK_PRIORITY_SORT_WEIGHT[leftTask.priority];
        case "priorityAsc":
          return TASK_PRIORITY_SORT_WEIGHT[leftTask.priority] - TASK_PRIORITY_SORT_WEIGHT[rightTask.priority];
        case "nameAsc":
          return leftTask.title.localeCompare(rightTask.title, undefined, { sensitivity: "base" });
        case "nameDesc":
          return rightTask.title.localeCompare(leftTask.title, undefined, { sensitivity: "base" });
        case "updatedDesc":
        default:
          return getTaskTimestampValue(rightTask.updatedAt) - getTaskTimestampValue(leftTask.updatedAt);
      }
    });

    return sortedTasks;
  }, [taskOrder, taskOriginFilter, taskPriorityFilter, taskSearchQuery, tasks]);

  return (
    <>
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
              <p className="text-sm text-muted-foreground">
                Workspace tasks are created and updated only through the Consellour tool flow.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshData()} disabled={isLoading}>
                <RefreshCw aria-hidden="true" className="size-4" />
                <span>Refresh</span>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsSettingsModalOpen(true)}>
                <Settings2 aria-hidden="true" className="size-4" />
                <span>Consellour settings</span>
              </Button>
            </div>
          </header>

          <div className="space-y-3">
            {jiraConnected ? (
              <JiraIntegrationPanel
                title="Jira"
                settings={jiraSettings}
                connected={jiraConnected}
                statusMessage={jiraStatusMessage}
                errorMessage={jiraErrorMessage}
                syncPending={isJiraSyncPending}
                connectPending={isJiraConnectPending}
                disconnectPending={isJiraDisconnectPending}
                onConnect={(payload) => {
                  setIsJiraConnectPending(true);
                  setJiraStatusMessage(null);
                  setJiraErrorMessage(null);

                  void (async () => {
                    try {
                      const response = await jiraConnectApiToken(payload);
                      if (!response.ok || !response.settings) {
                        setJiraErrorMessage(response.error ?? response.jiraError?.message ?? "Failed to connect Jira.");
                        return;
                      }
                      setJiraSettings(response.settings);
                      setJiraConnected(true);
                      setJiraStatusMessage(response.accountDisplayName ? `Connected as ${response.accountDisplayName}.` : "Jira connected.");
                    } catch {
                      setJiraErrorMessage("Failed to connect Jira.");
                    } finally {
                      setIsJiraConnectPending(false);
                    }
                  })();
                }}
                onDisconnect={() => {
                  setIsJiraDisconnectPending(true);
                  setJiraStatusMessage(null);
                  setJiraErrorMessage(null);

                  void (async () => {
                    try {
                      const response = await jiraDisconnect();
                      if (!response.ok || !response.settings) {
                        setJiraErrorMessage(response.error ?? "Failed to disconnect Jira.");
                        return;
                      }
                      setJiraSettings(response.settings);
                      setJiraConnected(false);
                      setJiraStatusMessage("Jira disconnected.");
                    } catch {
                      setJiraErrorMessage("Failed to disconnect Jira.");
                    } finally {
                      setIsJiraDisconnectPending(false);
                    }
                  })();
                }}
                onSyncNow={() => {
                  setIsJiraSyncPending(true);
                  setJiraStatusMessage(null);
                  setJiraErrorMessage(null);

                  void (async () => {
                    try {
                      const response = await jiraSyncPull({});
                      if (!response.ok) {
                        setJiraErrorMessage(response.error ?? response.jiraError?.message ?? "Jira sync failed.");
                        return;
                      }
                      setJiraSettings(response.settings ?? null);
                      setJiraStatusMessage(
                        `Synced ${response.importedCount + response.updatedCount} issues (${response.importedCount} imported, ${response.updatedCount} updated).`,
                      );
                      await refreshData();
                    } catch {
                      setJiraErrorMessage("Jira sync failed.");
                    } finally {
                      setIsJiraSyncPending(false);
                    }
                  })();
                }}
              />
            ) : null}

            {!isConsellourVisible ? (
              <Card className="py-2">
                <CardContent className="flex justify-center p-4">
                  <Button type="button" size="sm" onClick={() => setIsConsellourVisible(true)}>
                    Call Consellour
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-0">
                <div className="relative mx-auto w-full max-w-[1600px] rounded-t-xl border border-border border-b-0 bg-card p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-4 top-4 z-10 h-8 w-8 p-0"
                    aria-label="Collapse Consellour"
                    onClick={() => setIsConsellourVisible(false)}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                  <div
                    role="img"
                    aria-label="Consellour mascot"
                    className="pointer-events-none h-56 w-full text-foreground md:h-72"
                    style={{
                      backgroundColor: "currentColor",
                      WebkitMaskImage: 'url("/consellour/consellour.svg")',
                      WebkitMaskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                      WebkitMaskSize: "contain",
                      maskImage: 'url("/consellour/consellour.svg")',
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                      maskSize: "contain",
                    }}
                  />
                </div>

                <div className="rounded-b-xl border border-border border-t-0 bg-card p-4">
                  <div className="space-y-3">
                    {chatRows.length === 0 ? null : (
                      <div
                        ref={chatHistoryRef}
                        className={`space-y-2 overflow-y-auto p-2 transition-[max-height] duration-300 ease-in-out ${chatRows.length > 1 ? "max-h-[48rem]" : "max-h-48"}`}
                      >
                        {chatRows.map((row, index) => (
                          <div key={`${row.role}-${String(index)}`} className={`px-2 py-1 text-base ${row.role === "user" ? "text-right" : "text-left"}`}>
                            <TypewriterText text={row.text} animate={row.role === "assistant"} onProgress={scrollChatToBottom} />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(event) => {
                          setChatInput(event.target.value);
                        }}
                        placeholder="Ask Consellour to create/update/recommend tasks"
                        disabled={isConsellourRunning}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void runConsellour();
                          }
                        }}
                      />
                      <Button type="button" onClick={() => void runConsellour()} disabled={isConsellourRunning || chatInput.trim().length === 0}>
                        {isConsellourRunning ? "Thinking..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Tasks</h2>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
                <div className="flex min-w-[220px] flex-1 items-center gap-2">
                  <span className="text-xs text-muted-foreground">Search</span>
                  <Input
                    value={taskSearchQuery}
                    onChange={(event) => {
                      setTaskSearchQuery(event.target.value);
                    }}
                    placeholder="Task title or origin"
                    className="h-8"
                    aria-label="Search tasks"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <Dropdown
                    ariaLabel="Filter by task priority"
                    options={TASK_PRIORITY_FILTER_OPTIONS}
                    value={taskPriorityFilter}
                    placeholder="All priorities"
                    onValueChange={(nextValue) => {
                      setTaskPriorityFilter(nextValue as TaskPriorityFilter);
                    }}
                    triggerClassName="h-8 min-w-[170px]"
                    contentClassName="w-56"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Origin</span>
                  <Dropdown
                    ariaLabel="Filter by task origin"
                    options={TASK_ORIGIN_FILTER_OPTIONS}
                    value={taskOriginFilter}
                    placeholder="All origins"
                    onValueChange={(nextValue) => {
                      setTaskOriginFilter(nextValue as TaskOriginFilter);
                    }}
                    triggerClassName="h-8 min-w-[170px]"
                    contentClassName="w-56"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Order by</span>
                  <Dropdown
                    ariaLabel="Order tasks"
                    options={TASK_ORDER_OPTIONS}
                    value={taskOrder}
                    placeholder="Updated (newest)"
                    onValueChange={(nextValue) => {
                      setTaskOrder(nextValue as TaskOrder);
                    }}
                    triggerClassName="h-8 min-w-[190px]"
                    contentClassName="w-56"
                  />
                </div>
              </div>
              <div role="region" aria-label="Workspace tasks table" className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[45%]">Task</TableHead>
                      <TableHead className="w-[140px]">Priority</TableHead>
                      <TableHead className="w-[160px]">Origin</TableHead>
                      <TableHead className="w-[180px]">Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="py-3 text-sm text-muted-foreground">
                          Loading tasks...
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {!isLoading && tasks.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="py-3 text-sm text-muted-foreground">
                          No tasks yet. Ask Consellour to create one.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {!isLoading && tasks.length > 0 && visibleTasks.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="py-3 text-sm text-muted-foreground">
                          No tasks match the current controls.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {!isLoading
                      ? visibleTasks.map((task) => (
                          <TableRow
                            key={task.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedTaskId(task.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedTaskId(task.id);
                              }
                            }}
                            className={selectedTaskId === task.id ? "bg-muted/50 hover:bg-muted/50" : undefined}
                          >
                            <TableCell className="max-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">{task.title}</span>
                                {recommendedTaskId === task.id ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                                    <Sparkles aria-hidden="true" className="size-3" />
                                    recommended
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getTaskPriorityBadgeClasses(task.priority)}>
                                {task.priority}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{getTaskOriginLabel(task.origin)}</TableCell>
                            <TableCell className="text-muted-foreground">{new Date(task.updatedAt).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label={`Edit task ${task.title}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingTask(task);
                                    setEditTaskError(null);
                                    setIsEditTaskModalOpen(true);
                                  }}
                                >
                                  <Pencil aria-hidden="true" className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  aria-label={`Remove task ${task.title}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRemoveTaskTarget(task);
                                    setRemoveTaskError(null);
                                  }}
                                >
                                  <Trash2 aria-hidden="true" className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                  </TableBody>
                </Table>
              </div>
              {removeTaskError ? <p className="text-xs text-destructive">{removeTaskError}</p> : null}
            </section>

          </div>

          {loadError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p> : null}
        </div>
      )}

      <ConsellourSettingsModal
        open={isSettingsModalOpen}
        settings={consellourSettings}
        savePending={isSavingSettings}
        errorMessage={settingsError}
        onOpenChange={setIsSettingsModalOpen}
        onSave={(payload) => {
          void (async () => {
            setIsSavingSettings(true);
            setSettingsError(null);
            try {
              const result = await consellourUpdateSettings(payload);
              if (!result.ok || !result.settings) {
                setSettingsError(result.error ?? "Failed to save Consellour settings.");
                return;
              }
              setConsellourSettings(result.settings);
              setIsSettingsModalOpen(false);
            } catch {
              setSettingsError("Failed to save Consellour settings.");
            } finally {
              setIsSavingSettings(false);
            }
          })();
        }}
      />

      <EditTaskModal
        open={isEditTaskModalOpen}
        task={editingTask}
        savePending={isEditingTask}
        errorMessage={editTaskError}
        onOpenChange={(open) => {
          setIsEditTaskModalOpen(open);
          if (!open && !isEditingTask) {
            setEditingTask(null);
            setEditTaskError(null);
          }
        }}
        onSave={(payload) => {
          void (async () => {
            setIsEditingTask(true);
            setEditTaskError(null);
            try {
              const result = await consellourToolEditTask(payload);
              if (!result.ok || !result.task) {
                setEditTaskError(result.error ?? "Failed to edit task.");
                return;
              }

              setIsEditTaskModalOpen(false);
              setEditingTask(null);
              await refreshData();
            } catch {
              setEditTaskError("Failed to edit task.");
            } finally {
              setIsEditingTask(false);
            }
          })();
        }}
      />

      <ConfirmModal
        open={removeTaskTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isRemovingTask) {
            setRemoveTaskTarget(null);
          }
        }}
        title="Remove task?"
        description={
          removeTaskTarget
            ? `This permanently removes "${removeTaskTarget.title}" from this workspace.`
            : "This permanently removes this task from this workspace."
        }
        confirmLabel="Remove task"
        cancelLabel="Keep task"
        destructive
        loading={isRemovingTask}
        onConfirm={() => {
          if (!removeTaskTarget) {
            return;
          }

          void (async () => {
            setIsRemovingTask(true);
            setRemoveTaskError(null);
            try {
              const result = await consellourToolDeleteTask({ id: removeTaskTarget.id });
              if (!result.ok) {
                setRemoveTaskError(result.error ?? "Failed to remove task.");
                return;
              }

              setRemoveTaskTarget(null);
              await refreshData();
            } catch {
              setRemoveTaskError("Failed to remove task.");
            } finally {
              setIsRemovingTask(false);
            }
          })();
        }}
        onCancel={() => {
          if (isRemovingTask) {
            return;
          }
          setRemoveTaskTarget(null);
        }}
      />
    </>
  );
}
