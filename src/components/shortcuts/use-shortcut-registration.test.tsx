import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useShortcutRegistration } from "@/src/components/shortcuts/use-shortcut-registration";

vi.mock("@/src/components/shortcuts/shortcut-registry-context", () => ({
  KeyboardShortcutsContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
    Consumer: ({ children }: { children: (value: null) => ReactNode }) => children(null),
  },
}));

// Override useContext to return null (no provider)
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useContext: () => null,
  };
});

describe("useShortcutRegistration", () => {
  it("does nothing when context is null (no provider)", () => {
    const registration = {
      actionables: [{ id: "test", type: "button" as const, label: "Test", run: () => {} }],
    };

    // Should not throw when rendered without a KeyboardShortcutsProvider
    const { unmount } = renderHook(() => useShortcutRegistration(registration), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/"]}>
          {children}
        </MemoryRouter>
      ),
    });

    // If the early return guard works, no error is thrown
    unmount();
    expect(true).toBe(true);
  });
});
