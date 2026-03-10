import { useCallback, useEffect, useRef, useState } from "react";

import { Loader2, SendHorizonal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { runHelpChatTurn, type HelpChatMessage } from "@/libs/help/chat";
import { hasHelpKnowledgeBase } from "@/libs/help/retrieval";
import { consellourGetSettings, type ConsellourSettings } from "@/src/lib/ipc";

type HelpChatRow = HelpChatMessage & {
  citations?: Array<{ feature: string; heading: string }>;
};

type HelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [consellourSettings, setConsellourSettings] = useState<ConsellourSettings | null>(null);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [chatRows, setChatRows] = useState<HelpChatRow[]>([
    {
      role: "assistant",
      text: "Ask me how to use Groove features and I will answer using the local Help docs.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);

  const scrollChatToBottom = useCallback(() => {
    if (!chatHistoryRef.current) {
      return;
    }
    chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
  }, []);

  const loadConsellourSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);

    try {
      const response = await consellourGetSettings();
      if (!response.ok) {
        setHasOpenAiKey(false);
        setConsellourSettings(null);
        setSettingsError(response.error ?? "Could not load Consellour settings.");
        return;
      }

      const openAiApiKey = response.settings?.openaiApiKey?.trim() ?? "";
      setConsellourSettings(response.settings ?? null);
      setHasOpenAiKey(openAiApiKey.length > 0);
    } catch {
      setHasOpenAiKey(false);
      setConsellourSettings(null);
      setSettingsError("Could not load Consellour settings.");
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadConsellourSettings();
  }, [open, loadConsellourSettings]);

  useEffect(() => {
    scrollChatToBottom();
  }, [chatRows.length, scrollChatToBottom]);

  const runHelpChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || isResponding || !consellourSettings?.openaiApiKey) {
      return;
    }

    const requestHistory = chatRows.map(({ role, text }) => ({ role, text }));

    setChatRows((current) => [...current, { role: "user", text: prompt }]);
    setChatInput("");
    setIsResponding(true);

    try {
      const result = await runHelpChatTurn({
        apiKey: consellourSettings.openaiApiKey,
        model: consellourSettings.model,
        reasoningLevel: consellourSettings.reasoningLevel,
        history: requestHistory,
        prompt,
      });

      setChatRows((current) => [
        ...current,
        {
          role: "assistant",
          text: result.answer,
          citations: result.chunks.map((chunk) => ({
            feature: chunk.feature,
            heading: chunk.heading,
          })),
        },
      ]);
    } catch (error) {
      setChatRows((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "Help could not complete the request.",
        },
      ]);
    } finally {
      setIsResponding(false);
    }
  }, [chatInput, chatRows, consellourSettings, isResponding]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
          </DialogHeader>

        {isLoadingSettings ? (
          <section className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 px-6 text-center">
            <Loader2 aria-hidden="true" className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading Consellour settings...</p>
          </section>
        ) : settingsError ? (
          <section className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-destructive">Could not load Consellour settings.</p>
            <p className="text-sm text-muted-foreground">{settingsError}</p>
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={() => void loadConsellourSettings()}>
                Retry
              </Button>
            </div>
          </section>
        ) : hasOpenAiKey ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-card">
              <div ref={chatHistoryRef} className="min-h-[380px] max-h-[50vh] space-y-3 overflow-y-auto p-3">
                {chatRows.map((row, index) => (
                  <div key={`${row.role}-${String(index)}`} className={`flex ${row.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        row.role === "user" ? "bg-primary text-primary-foreground" : "border bg-muted/40"
                      }`}
                    >
                      {row.text}
                      {row.role === "assistant" && row.citations && row.citations.length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {row.citations.slice(0, 3).map((citation) => `${citation.feature}/${citation.heading}`).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}

                {isResponding ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(event) => {
                  setChatInput(event.target.value);
                }}
                placeholder="Ask anything"
                disabled={isResponding || !hasHelpKnowledgeBase()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runHelpChat();
                  }
                }}
              />
              <Button type="button" disabled={isResponding || chatInput.trim().length === 0 || !hasHelpKnowledgeBase()} onClick={() => void runHelpChat()}>
                <SendHorizonal aria-hidden="true" className="size-4" />
                <span>Send</span>
              </Button>
            </div>

            {!hasHelpKnowledgeBase() ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                Help docs were not bundled. Run build embedding generation and reopen this modal.
              </p>
            ) : null}
          </div>
        ) : (
          <section className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 px-6 text-center">
            <img src="/consellour/consellour.svg" alt="Consellour" className="h-24 w-24 opacity-90" />
            <h2 className="text-base font-medium">No Consellour OpenAI API key configured</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Set an OpenAI API key in Consellour settings to use Help chat.
            </p>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
