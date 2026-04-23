import React from "react"
import { Toaster as Sonner, toast } from "sonner"
import { useTheme } from "@/hooks/useTheme.hook"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { effectiveTheme } = useTheme();

  return (
    <Sonner
      theme={effectiveTheme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            [
              "group toast group-[.toaster]:shadow-lg",
              "group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border",
              "data-[type=success]:bg-[hsl(var(--status-success-background))] data-[type=success]:text-[hsl(var(--status-success-foreground))] data-[type=success]:border-[hsl(var(--status-success))]",
              "data-[type=error]:bg-[hsl(var(--status-error-background))] data-[type=error]:text-[hsl(var(--status-error-foreground))] data-[type=error]:border-[hsl(var(--status-error))]",
              "data-[type=warning]:bg-[hsl(var(--status-warning-background))] data-[type=warning]:text-[hsl(var(--status-warning-foreground))] data-[type=warning]:border-[hsl(var(--status-warning))]",
              "data-[type=info]:bg-[hsl(var(--status-info-background))] data-[type=info]:text-[hsl(var(--status-info-foreground))] data-[type=info]:border-[hsl(var(--status-info))]",
            ].join(" "),
          title: "font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "data-[type=success]:text-[hsl(var(--status-success-foreground))]",
          error: "data-[type=error]:text-[hsl(var(--status-error-foreground))]",
          warning: "data-[type=warning]:text-[hsl(var(--status-warning-foreground))]",
          info: "data-[type=info]:text-[hsl(var(--status-info-foreground))]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
