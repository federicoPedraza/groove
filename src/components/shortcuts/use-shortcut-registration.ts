"use client";

import { useContext, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { KeyboardShortcutsContext, type ShortcutRegistration } from "@/src/components/shortcuts/shortcut-registry-context";

export function useShortcutRegistration(registration: ShortcutRegistration): void {
  const location = useLocation();
  const context = useContext(KeyboardShortcutsContext);
  const registrationIdRef = useRef(`shortcut-registration-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!context) {
      return;
    }

    const registrationId = registrationIdRef.current;
    context.register(registrationId, location.pathname, registration);
    return () => {
      context.unregister(registrationId);
    };
  }, [context, location.pathname, registration]);
}
