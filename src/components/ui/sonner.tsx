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
              "group toast shadow-lg bg-background text-foreground border-border",
              "data-[type=success]:bg-[hsl(var(--status-success-background))] data-[type=success]:text-green-800 data-[type=success]:border-[hsl(var(--status-success))]",
              "data-[type=error]:bg-[hsl(var(--status-error-background))] data-[type=error]:text-red-800 data-[type=error]:border-[hsl(var(--status-error))]",
              "data-[type=warning]:bg-[hsl(var(--status-warning-background))] data-[type=warning]:text-yellow-800 data-[type=warning]:border-[hsl(var(--status-warning))]",
              "data-[type=info]:bg-[hsl(var(--status-info-background))] data-[type=info]:text-blue-800 data-[type=info]:border-[hsl(var(--status-info))]",
            ].join(" "),
          title: "font-semibold group-[.toast]:text-current",
          description: "group-[.toast]:text-current opacity-90",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "data-[type=success]:text-green-800",
          error: "data-[type=error]:text-red-800",
          warning: "data-[type=warning]:text-yellow-800",
          info: "data-[type=info]:text-blue-800",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
