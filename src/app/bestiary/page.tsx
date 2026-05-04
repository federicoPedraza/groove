"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { BestiaryBadge } from "@/src/components/pages/bestiary/bestiary-badge";
import { UnitCard } from "@/src/components/pages/bestiary/unit-card";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import {
  BUG_DEFINITIONS,
  KINGDOMS,
  getBugDefinition,
  getBugsByKingdom,
  type BugDefinition,
  type BugKingdom,
} from "@/src/lib/bestiary/definitions";
import {
  getWorkspaceContextStoreSnapshot,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

// Mirrors BUG_NAME_LIBRARY.len() in
// src-tauri/src/backend/workspace_metadata_settings/settings_runtime.rs.
// Keep in sync if the Rust library grows.
const BESTIARY_TOTAL_BUGS = BUG_DEFINITIONS.length;

type KingdomGroup = {
  slug: BugKingdom;
  label: string;
  tagline: string;
  knownInOrder: BugDefinition[];
  hiddenCount: number;
};

export default function BestiaryPage() {
  useAppLayout({});

  const [selectedBugName, setSelectedBugName] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );

  const workspaceMeta = snapshot.context?.workspaceMeta ?? null;
  const knownBugs = useMemo(
    () => workspaceMeta?.knownBugs ?? [],
    [workspaceMeta],
  );

  const kingdomGroups = useMemo<KingdomGroup[]>(() => {
    const knownRank = new Map<string, number>();
    knownBugs.forEach((name, index) => {
      knownRank.set(name, index);
    });

    return KINGDOMS.map((kingdom) => {
      const kingdomBugs = getBugsByKingdom(kingdom.slug);
      const knownInOrder = kingdomBugs
        .filter((bug) => knownRank.has(bug.name))
        .sort(
          (a, b) =>
            (knownRank.get(a.name) ?? 0) - (knownRank.get(b.name) ?? 0),
        );
      return {
        slug: kingdom.slug,
        label: kingdom.label,
        tagline: kingdom.tagline,
        knownInOrder,
        hiddenCount: kingdomBugs.length - knownInOrder.length,
      };
    });
  }, [knownBugs]);

  const selectedDefinition = selectedBugName
    ? (getBugDefinition(selectedBugName) ?? null)
    : null;

  if (!workspaceMeta) {
    return (
      <section className="mx-auto w-full max-w-7xl space-y-3 p-4 md:p-6">
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Open a workspace to view its bestiary.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Bestiary</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {knownBugs.length} / {BESTIARY_TOTAL_BUGS} discovered
        </p>
      </header>

      <div className="space-y-6">
        {kingdomGroups.map((group) => (
          <section key={group.slug} className="space-y-2">
            <div>
              <h2 className="text-base font-semibold">{group.label}</h2>
              <p className="text-xs text-muted-foreground">{group.tagline}</p>
            </div>
            <div
              role="list"
              aria-label={`${group.label} bugs`}
              className="flex flex-wrap gap-2"
            >
              {group.knownInOrder.map((bug) => (
                <div role="listitem" key={`known-${bug.name}`}>
                  <BestiaryBadge
                    mode="known"
                    name={bug.name}
                    onClick={() => {
                      setSelectedBugName(bug.name);
                    }}
                  />
                </div>
              ))}
              {Array.from({ length: group.hiddenCount }, (_, index) => (
                <div
                  role="listitem"
                  key={`hidden-${group.slug}-${String(index)}`}
                >
                  <BestiaryBadge mode="hidden" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <UnitCard
        open={selectedDefinition !== null}
        definition={selectedDefinition}
        onClose={() => {
          setSelectedBugName(null);
        }}
      />
    </section>
  );
}
