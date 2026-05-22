"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { ItemCard } from "@/src/components/pages/items/item-card";
import { ItemDetailCard } from "@/src/components/pages/items/item-detail-card";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { KINGDOMS, type BugKingdom } from "@/src/lib/bestiary/definitions";
import {
  ITEM_DEFINITIONS,
  getIconicItemsForKingdom,
  getKingdomItems,
  getUniversalItems,
  type ItemDefinition,
} from "@/src/lib/items/definitions";
import {
  getWorkspaceContextStoreSnapshot,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

type InventorySection = {
  key: string;
  title: string;
  subtitle: string;
  items: readonly ItemDefinition[];
};

type CategoryRender = {
  section: InventorySection;
  ownedTotal: number;
};

export default function InventoryPage() {
  useAppLayout({});

  const snapshot = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );

  const workspaceMeta = snapshot.context?.workspaceMeta ?? null;
  const inventory = useMemo(
    () => workspaceMeta?.inventory ?? {},
    [workspaceMeta],
  );
  const [selectedItem, setSelectedItem] = useState<ItemDefinition | null>(null);

  const sections = useMemo<InventorySection[]>(() => {
    const universal: InventorySection = {
      key: "universal",
      title: "Universal drops",
      subtitle: "Common scraps any beast can yield.",
      items: getUniversalItems(),
    };
    const perKingdom = KINGDOMS.flatMap<InventorySection>((kingdom) => {
      const slug: BugKingdom = kingdom.slug;
      return [
        {
          key: `${slug}-shared`,
          title: kingdom.label,
          subtitle: `${kingdom.tagline} — shared kingdom drops.`,
          items: getKingdomItems(slug),
        },
        {
          key: `${slug}-iconic`,
          title: `${kingdom.label} iconics`,
          subtitle: "One iconic per beast — only that beast can drop it.",
          items: getIconicItemsForKingdom(slug),
        },
      ];
    });
    return [universal, ...perKingdom];
  }, []);

  const totalOwned = useMemo(
    () =>
      Object.values(inventory).reduce(
        (sum, count) => sum + Math.max(count, 0),
        0,
      ),
    [inventory],
  );
  const distinctOwned = useMemo(
    () => Object.entries(inventory).filter(([, count]) => count > 0).length,
    [inventory],
  );

  const renderable = useMemo<CategoryRender[]>(
    () =>
      sections.map((section) => ({
        section,
        ownedTotal: section.items.reduce((sum, item) => {
          const count = inventory[item.id] ?? 0;
          return sum + Math.max(count, 0);
        }, 0),
      })),
    [sections, inventory],
  );

  if (!workspaceMeta) {
    return (
      <section className="mx-auto w-full max-w-7xl space-y-3 p-4 md:p-6">
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Open a workspace to view its inventory.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {distinctOwned} / {ITEM_DEFINITIONS.length} discovered ·{" "}
          {totalOwned} total items
        </p>
      </header>

      <div className="space-y-6">
        {renderable.map(({ section, ownedTotal }) => (
          <section key={section.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{section.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {section.subtitle}
                </p>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {ownedTotal} owned
              </p>
            </div>
            <div
              role="list"
              aria-label={`${section.title} items`}
              className="flex flex-wrap gap-2"
            >
              {section.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  count={inventory[item.id] ?? 0}
                  onSelect={setSelectedItem}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ItemDetailCard
        open={selectedItem !== null}
        item={selectedItem}
        count={selectedItem ? inventory[selectedItem.id] ?? 0 : 0}
        onClose={() => {
          setSelectedItem(null);
        }}
      />
    </section>
  );
}
