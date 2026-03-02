"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";

type SearchDropdownProps = {
  ariaLabel: string;
  searchAriaLabel: string;
  options: DropdownOption[];
  value: string | null;
  placeholder: string;
  searchPlaceholder?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  noResultsLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

export function SearchDropdown({
  ariaLabel,
  searchAriaLabel,
  options,
  value,
  placeholder,
  searchPlaceholder = "Search...",
  onValueChange,
  disabled = false,
  emptyLabel = "No options available.",
  noResultsLabel = "No matching results.",
  triggerClassName,
  contentClassName,
}: SearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo<DropdownOption[]>(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      return [option.label, option.value, option.valueLabel]
        .filter((candidate): candidate is string => Boolean(candidate))
        .some((candidate) => candidate.toLowerCase().includes(normalizedQuery));
    });
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [open]);

  const emptyStateLabel = options.length === 0 ? emptyLabel : noResultsLabel;

  return (
    <Dropdown
      ariaLabel={ariaLabel}
      options={filteredOptions}
      value={value}
      placeholder={placeholder}
      onValueChange={(nextValue) => {
        onValueChange(nextValue);
        setOpen(false);
      }}
      disabled={disabled}
      emptyLabel={emptyStateLabel}
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
      open={open}
      onOpenChange={setOpen}
      menuHeader={
        <div className="px-1 pb-1">
          <label className="sr-only" htmlFor={searchInputId}>
            {searchAriaLabel}
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={searchInputId}
              ref={searchInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={searchPlaceholder}
              className="h-8 pl-8"
              aria-label={searchAriaLabel}
              onKeyDown={(event) => {
                if (event.key !== "Escape") {
                  event.stopPropagation();
                }
              }}
            />
          </div>
        </div>
      }
    />
  );
}
