import * as React from "react";
import { cva } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sidebarVariants = cva(
  "hidden shrink-0 rounded-xl border bg-card text-card-foreground shadow-xs md:flex md:flex-col md:sticky md:top-4 md:h-[calc(100vh-2rem)] transition-[width] duration-200",
  {
    variants: {
      collapsed: {
        true: "w-16",
        false: "w-56",
      },
    },
    defaultVariants: {
      collapsed: false,
    },
  },
);

type SidebarProps = React.ComponentProps<"aside"> & {
  collapsed?: boolean;
};

function Sidebar({ className, collapsed = false, ...props }: SidebarProps) {
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(sidebarVariants({ collapsed }), className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b p-3", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 p-2", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav className={cn("grid gap-1", className)} {...props} />;
}

type SidebarMenuButtonProps = React.ComponentProps<"button"> & {
  isActive?: boolean;
  collapsed?: boolean;
};

function sidebarMenuButtonClassName({
  isActive = false,
  collapsed = false,
  className,
}: {
  isActive?: boolean;
  collapsed?: boolean;
  className?: string;
}) {
  return cn(
    buttonVariants({
      variant: isActive ? "secondary" : "ghost",
      size: "default",
    }),
    "h-10 justify-start overflow-hidden",
    collapsed && "justify-center px-0",
    className,
  );
}

function SidebarMenuButton({
  className,
  isActive = false,
  collapsed = false,
  children,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <button
      className={sidebarMenuButtonClassName({ isActive, collapsed, className })}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  sidebarMenuButtonClassName,
};
