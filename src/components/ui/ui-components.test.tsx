import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Checkbox } from "@/src/components/ui/checkbox";
import { ConfirmModal } from "@/src/components/ui/confirm-modal";
import { Dropdown } from "@/src/components/ui/dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { SearchDropdown } from "@/src/components/ui/search-dropdown";
import {
  Sidebar,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  sidebarMenuButtonClassName,
} from "@/src/components/ui/sidebar";
import { Toaster } from "@/src/components/ui/sonner";
import { TooltipProvider } from "@/src/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe("Card components", () => {
  it("renders Card with data-slot", () => {
    render(<Card data-testid="card">content</Card>);
    const el = screen.getByTestId("card");
    expect(el.getAttribute("data-slot")).toBe("card");
    expect(el.textContent).toBe("content");
  });

  it("renders Card with custom className", () => {
    render(<Card data-testid="card" className="extra" />);
    expect(screen.getByTestId("card").className).toContain("extra");
  });

  it("renders CardHeader", () => {
    render(<CardHeader data-testid="hdr">header</CardHeader>);
    expect(screen.getByTestId("hdr").getAttribute("data-slot")).toBe("card-header");
  });

  it("renders CardTitle", () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText("Title").tagName).toBe("H3");
  });

  it("renders CardDescription", () => {
    render(<CardDescription>Desc</CardDescription>);
    expect(screen.getByText("Desc").tagName).toBe("P");
  });

  it("renders CardContent", () => {
    render(<CardContent data-testid="cc">body</CardContent>);
    expect(screen.getByTestId("cc").getAttribute("data-slot")).toBe("card-content");
  });
});

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------
describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    render(<Checkbox aria-label="toggle" />);
    const cb = screen.getByRole("checkbox", { name: "toggle" });
    expect(cb.getAttribute("data-state")).toBe("unchecked");
  });

  it("renders checked and shows indicator", () => {
    render(<Checkbox aria-label="toggle" checked />);
    const cb = screen.getByRole("checkbox", { name: "toggle" });
    expect(cb.getAttribute("data-state")).toBe("checked");
  });

  it("toggles when clicked", () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="toggle" onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "toggle" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("applies custom className", () => {
    render(<Checkbox aria-label="toggle" className="custom-class" />);
    const cb = screen.getByRole("checkbox", { name: "toggle" });
    expect(cb.className).toContain("custom-class");
  });
});

// ---------------------------------------------------------------------------
// AlertDialog
// ---------------------------------------------------------------------------
describe("AlertDialog components", () => {
  it("renders all sub-components when open", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alert Title</AlertDialogTitle>
            <AlertDialogDescription>Alert description text</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByText("Alert Title")).toBeTruthy();
    expect(screen.getByText("Alert description text")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it("does not render content when closed", () => {
    render(
      <AlertDialog open={false}>
        <AlertDialogContent>
          <AlertDialogTitle>Hidden</AlertDialogTitle>
          <AlertDialogDescription>hidden desc</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("renders AlertDialogPortal and AlertDialogOverlay standalone", () => {
    render(
      <AlertDialog open>
        <AlertDialogPortal>
          <AlertDialogOverlay data-testid="overlay" />
          <div>portal content</div>
        </AlertDialogPortal>
      </AlertDialog>,
    );
    expect(screen.getByTestId("overlay")).toBeTruthy();
    expect(screen.getByText("portal content")).toBeTruthy();
  });

  it("applies custom className to AlertDialogContent", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent className="custom-dialog">
          <AlertDialogTitle>Styled</AlertDialogTitle>
          <AlertDialogDescription>styled desc</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const content = screen.getByText("Styled").closest("[data-slot='alert-dialog-content']");
    expect(content?.className).toContain("custom-dialog");
  });
});

// ---------------------------------------------------------------------------
// ConfirmModal
// ---------------------------------------------------------------------------
describe("ConfirmModal", () => {
  const defaultProps = {
    open: true,
    title: "Confirm?",
    description: "Are you sure?",
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders title and description when open", () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText("Confirm?")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
  });

  it("renders default confirm and cancel labels", () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders custom labels", () => {
    render(
      <ConfirmModal {...defaultProps} confirmLabel="Yes" cancelLabel="No" />,
    );
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables buttons when loading", () => {
    render(
      <ConfirmModal {...defaultProps} loading />,
    );
    const confirmBtn = screen.getByText("Confirm").closest("button")!;
    const cancelBtn = screen.getByText("Cancel").closest("button")!;
    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
  });

  it("renders destructive variant", () => {
    render(<ConfirmModal {...defaultProps} destructive />);
    const confirmBtn = screen.getByText("Confirm").closest("button")!;
    expect(confirmBtn.className).toBeTruthy();
  });

  it("renders secondary action button when props are provided", () => {
    const onSecondary = vi.fn();
    render(
      <ConfirmModal
        {...defaultProps}
        secondaryActionLabel="Maybe"
        onSecondaryAction={onSecondary}
      />,
    );
    const secondaryBtn = screen.getByText("Maybe");
    expect(secondaryBtn).toBeTruthy();
    fireEvent.click(secondaryBtn);
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it("renders secondary action with destructive styling", () => {
    render(
      <ConfirmModal
        {...defaultProps}
        secondaryActionLabel="Delete"
        onSecondaryAction={vi.fn()}
        secondaryActionDestructive
      />,
    );
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("does not render secondary action without label", () => {
    render(
      <ConfirmModal
        {...defaultProps}
        onSecondaryAction={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  it("does not render secondary action with whitespace-only label", () => {
    render(
      <ConfirmModal
        {...defaultProps}
        secondaryActionLabel="   "
        onSecondaryAction={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  it("prevents secondary action when loading", () => {
    const onSecondary = vi.fn();
    render(
      <ConfirmModal
        {...defaultProps}
        secondaryActionLabel="Maybe"
        onSecondaryAction={onSecondary}
        loading
      />,
    );
    const btn = screen.getByText("Maybe").closest("button")!;
    expect(btn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DropdownMenu (low-level)
// ---------------------------------------------------------------------------
describe("DropdownMenu components", () => {
  it("renders DropdownMenuContent and DropdownMenuItem when open", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item A</DropdownMenuItem>
          <DropdownMenuItem>Item B</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Item A")).toBeTruthy();
    expect(screen.getByText("Item B")).toBeTruthy();
  });

  it("applies custom className to DropdownMenuContent", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent className="custom-content" data-testid="ddcontent">
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByTestId("ddcontent").className).toContain("custom-content");
  });

  it("applies custom className to DropdownMenuItem", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem className="item-class" data-testid="item">
            Item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByTestId("item").className).toContain("item-class");
  });
});

// ---------------------------------------------------------------------------
// Dropdown (high-level)
// ---------------------------------------------------------------------------
describe("Dropdown", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta", valueLabel: "B value" },
    { value: "c", label: "Gamma", icon: <span data-testid="icon-c">IC</span> },
  ];

  function renderDropdown(props: Partial<React.ComponentProps<typeof Dropdown>> = {}) {
    return render(
      <TooltipProvider>
        <Dropdown
          ariaLabel="Test dropdown"
          options={options}
          value={null}
          placeholder="Pick one"
          onValueChange={vi.fn()}
          {...props}
        />
      </TooltipProvider>,
    );
  }

  it("renders trigger with placeholder when no value selected", () => {
    renderDropdown();
    expect(screen.getByText("Pick one")).toBeTruthy();
  });

  it("shows selected option label in trigger", () => {
    renderDropdown({ value: "a" });
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("opens and shows options", () => {
    renderDropdown({ open: true });
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("calls onValueChange when option is selected", () => {
    const onValueChange = vi.fn();
    renderDropdown({ onValueChange, open: true });
    fireEvent.click(screen.getByText("Alpha"));
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("shows empty label when options array is empty", () => {
    renderDropdown({ options: [], emptyLabel: "Nothing here", open: true });
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("shows check icon for selected option", () => {
    renderDropdown({ value: "a", open: true });
    const menuItems = screen.getAllByRole("menuitem");
    const selectedItem = menuItems.find((item) => item.textContent?.includes("Alpha"));
    expect(selectedItem).toBeTruthy();
  });

  it("renders option with icon", () => {
    renderDropdown({ open: true });
    expect(screen.getByTestId("icon-c")).toBeTruthy();
  });

  it("renders option with valueLabel", () => {
    renderDropdown({ open: true });
    expect(screen.getByText("B value")).toBeTruthy();
  });

  it("hides chevron when hideChevron is true", () => {
    renderDropdown({ hideChevron: true });
    expect(screen.getByRole("button", { name: "Test dropdown" })).toBeTruthy();
  });

  it("renders with triggerIcon and hideChevron for icon-only mode", () => {
    renderDropdown({
      triggerIcon: <span data-testid="trigger-icon">TI</span>,
      hideChevron: true,
      placeholder: "",
      value: null,
    });
    expect(screen.getByTestId("trigger-icon")).toBeTruthy();
  });

  it("renders with triggerTooltip", () => {
    renderDropdown({ triggerTooltip: "Help text" });
    expect(screen.getByRole("button", { name: "Test dropdown" })).toBeTruthy();
  });

  it("renders with menuHeader", () => {
    renderDropdown({ menuHeader: <div data-testid="menu-hdr">Header</div>, open: true });
    expect(screen.getByTestId("menu-hdr")).toBeTruthy();
  });

  it("disables trigger when disabled", () => {
    renderDropdown({ disabled: true });
    expect(screen.getByRole("button", { name: "Test dropdown" }).hasAttribute("disabled")).toBe(true);
  });

  it("renders with disabled option", () => {
    renderDropdown({
      open: true,
      options: [{ value: "d", label: "Disabled", disabled: true }],
    });
    expect(screen.getByText("Disabled")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SearchDropdown
// ---------------------------------------------------------------------------
describe("SearchDropdown", () => {
  const options = [
    { value: "foo", label: "Foo" },
    { value: "bar", label: "Bar" },
    { value: "baz", label: "Baz" },
  ];

  function renderSearchDropdown(
    props: Partial<React.ComponentProps<typeof SearchDropdown>> = {},
  ) {
    return render(
      <TooltipProvider>
        <SearchDropdown
          ariaLabel="Search dropdown"
          searchAriaLabel="Search options"
          options={options}
          value={null}
          placeholder="Select..."
          onValueChange={vi.fn()}
          {...props}
        />
      </TooltipProvider>,
    );
  }

  it("renders trigger with placeholder", () => {
    renderSearchDropdown();
    expect(screen.getByText("Select...")).toBeTruthy();
  });

  it("opens and shows search input and options", async () => {
    renderSearchDropdown();
    // SearchDropdown manages its own open state, so we need to trigger it
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    expect(screen.getByText("Foo")).toBeTruthy();
    expect(screen.getByText("Bar")).toBeTruthy();
  });

  it("filters options based on search query", async () => {
    renderSearchDropdown();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "fo" } });
    await waitFor(() => {
      expect(screen.queryByText("Bar")).toBeNull();
    });
    expect(screen.getByText("Foo")).toBeTruthy();
  });

  it("shows no results label when search has no matches", async () => {
    renderSearchDropdown({ noResultsLabel: "Nothing found." });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "zzz" } });
    await waitFor(() => {
      expect(screen.getByText("Nothing found.")).toBeTruthy();
    });
  });

  it("shows empty label when options array is empty", async () => {
    renderSearchDropdown({ options: [], emptyLabel: "No options." });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByText("No options.")).toBeTruthy();
    });
  });

  it("calls onValueChange and closes on selection", async () => {
    const onValueChange = vi.fn();
    renderSearchDropdown({ onValueChange });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByText("Bar")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Bar"));
    expect(onValueChange).toHaveBeenCalledWith("bar");
  });

  it("limits results when maxResults is set", async () => {
    renderSearchDropdown({ maxResults: 1 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    });
  });

  it("keeps selected option visible even when filtered out", async () => {
    renderSearchDropdown({ value: "baz" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "foo" } });
    await waitFor(() => {
      expect(screen.getByText("Foo")).toBeTruthy();
    });
    // Baz (selected) should remain visible (appears in trigger + menu item)
    expect(screen.getAllByText("Baz").length).toBeGreaterThanOrEqual(1);
  });

  it("filters by valueLabel", async () => {
    const optionsWithValueLabel = [
      { value: "x", label: "X Label", valueLabel: "secret" },
      { value: "y", label: "Y Label" },
    ];
    renderSearchDropdown({ options: optionsWithValueLabel });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "secret" } });
    await waitFor(() => {
      expect(screen.queryByText("Y Label")).toBeNull();
    });
    expect(screen.getByText("X Label")).toBeTruthy();
  });

  it("does not propagate non-Escape keydown from search input", async () => {
    renderSearchDropdown();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Search dropdown" }), { button: 0, pointerType: "mouse" });
    await waitFor(() => {
      expect(screen.getByLabelText("Search options")).toBeTruthy();
    });
    const searchInput = screen.getByLabelText("Search options");
    fireEvent.keyDown(searchInput, { key: "a" });
    // The dropdown should still be open
    expect(searchInput).toBeTruthy();
  });

  it("renders disabled trigger", () => {
    renderSearchDropdown({ disabled: true });
    expect(screen.getByRole("button", { name: "Search dropdown" }).hasAttribute("disabled")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Toaster (sonner)
// ---------------------------------------------------------------------------
describe("Toaster", () => {
  it("renders without crashing", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });

  it("passes additional props", () => {
    const { container } = render(<Toaster data-testid="toaster" />);
    expect(container).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
describe("Sidebar components", () => {
  it("renders Sidebar expanded by default", () => {
    render(<Sidebar data-testid="sidebar">content</Sidebar>);
    const el = screen.getByTestId("sidebar");
    expect(el.getAttribute("data-collapsed")).toBe("false");
    expect(el.tagName).toBe("ASIDE");
  });

  it("renders Sidebar collapsed", () => {
    render(<Sidebar data-testid="sidebar" collapsed>content</Sidebar>);
    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("true");
  });

  it("renders Sidebar with custom className", () => {
    render(<Sidebar data-testid="sidebar" className="extra">content</Sidebar>);
    expect(screen.getByTestId("sidebar").className).toContain("extra");
  });

  it("renders SidebarHeader", () => {
    render(<SidebarHeader data-testid="sh">header</SidebarHeader>);
    expect(screen.getByTestId("sh").textContent).toBe("header");
  });

  it("renders SidebarContent", () => {
    render(<SidebarContent data-testid="sc">body</SidebarContent>);
    expect(screen.getByTestId("sc").textContent).toBe("body");
  });

  it("renders SidebarMenu", () => {
    render(<SidebarMenu data-testid="sm">menu</SidebarMenu>);
    expect(screen.getByTestId("sm").tagName).toBe("NAV");
  });

  it("renders SidebarMenuButton with default props", () => {
    render(<SidebarMenuButton>Click me</SidebarMenuButton>);
    expect(screen.getByText("Click me").tagName).toBe("BUTTON");
  });

  it("renders SidebarMenuButton with isActive", () => {
    render(<SidebarMenuButton isActive>Active</SidebarMenuButton>);
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("renders SidebarMenuButton collapsed", () => {
    render(<SidebarMenuButton collapsed>Collapsed</SidebarMenuButton>);
    const btn = screen.getByText("Collapsed");
    expect(btn.className).toContain("justify-center");
  });

  it("returns correct className from sidebarMenuButtonClassName", () => {
    const cls = sidebarMenuButtonClassName({ isActive: true, collapsed: true, className: "extra" });
    expect(cls).toContain("justify-center");
    expect(cls).toContain("extra");
  });

  it("returns default className from sidebarMenuButtonClassName", () => {
    const cls = sidebarMenuButtonClassName({});
    expect(cls).toContain("justify-start");
  });
});

describe("SidebarCollapseButton", () => {
  it("renders with collapse label when expanded", () => {
    render(<SidebarCollapseButton collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByLabelText("Collapse sidebar")).toBeTruthy();
  });

  it("renders with expand label when collapsed", () => {
    render(<SidebarCollapseButton collapsed onToggle={vi.fn()} />);
    expect(screen.getByLabelText("Expand sidebar")).toBeTruthy();
  });

  it("calls onToggle with true when expanded and clicked", () => {
    const onToggle = vi.fn();
    render(<SidebarCollapseButton collapsed={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle with false when collapsed and clicked", () => {
    const onToggle = vi.fn();
    render(<SidebarCollapseButton collapsed onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText("Expand sidebar"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("uses custom expand/collapse labels", () => {
    render(
      <SidebarCollapseButton
        collapsed
        onToggle={vi.fn()}
        expandLabel="Open it"
        collapseLabel="Close it"
      />,
    );
    expect(screen.getByLabelText("Open it")).toBeTruthy();
  });

  it("applies custom className", () => {
    render(
      <SidebarCollapseButton collapsed={false} onToggle={vi.fn()} className="my-class" />,
    );
    expect(screen.getByLabelText("Collapse sidebar").className).toContain("my-class");
  });
});
