import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        positive: "border-transparent bg-positive/15 text-positive",
        neutral: "border-transparent bg-neutral/15 text-foreground/70",
        warning: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        negative: "border-transparent bg-negative/15 text-negative",
        high: "border-transparent bg-red-600 text-white",
        medium: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        low: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
