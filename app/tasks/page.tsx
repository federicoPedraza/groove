"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, RefreshCw, Settings2, Sparkles, Trash2, X } from "lucide-react";

import { runConsellourToolLoop } from "@/libs/ai";
import { EditTaskModal } from "@/components/edit-task-modal";
import { JiraIntegrationPanel } from "@/components/jira/jira-integration-panel";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import { useAppLayout } from "@/components/pages/use-app-layout";
import { ConsellourSettingsModal } from "@/components/consellour-settings-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
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

  return (
    <>
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Tasks + Consellour</h1>
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

            <Card className="gap-2 py-4">
              <CardHeader>
                <CardTitle className="text-base">Tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? <p className="text-sm text-muted-foreground">Loading tasks...</p> : null}
                {!isLoading && tasks.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">No tasks yet. Ask Consellour to create one.</p>
                ) : null}
                {tasks.map((task) => (
                  <div
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
                    className={`w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedTaskId === task.id ? "border-foreground/40 bg-muted" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{task.title}</span>
                      <div className="flex items-center gap-1">
                        {recommendedTaskId === task.id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Sparkles aria-hidden="true" className="size-3" />
                            recommended
                          </span>
                        ) : null}
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
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                  </div>
                ))}
                {removeTaskError ? <p className="text-xs text-destructive">{removeTaskError}</p> : null}
              </CardContent>
            </Card>

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
