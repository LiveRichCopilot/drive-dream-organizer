import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-2xl border border-white/30 text-white/90 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:from-white/30 hover:to-white/10 transition-all",
        destructive: "bg-gradient-to-br from-red-500/20 to-red-600/5 backdrop-blur-2xl border border-red-400/30 text-white/90 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:from-red-400/30 hover:to-red-500/10 transition-all",
        outline: "bg-gradient-to-br from-white/10 to-transparent backdrop-blur-2xl border border-white/30 text-white/80 hover:from-white/20 hover:to-white/5 hover:text-white/90 transition-all",
        secondary: "bg-gradient-to-br from-purple-500/20 to-purple-600/5 backdrop-blur-2xl border border-purple-400/30 text-white/90 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:from-purple-400/30 hover:to-purple-500/10 transition-all",
        ghost: "bg-gradient-to-br from-white/5 to-transparent backdrop-blur-xl hover:from-white/15 hover:to-white/5 text-white/70 hover:text-white/90 transition-all",
        link: "text-white/80 underline-offset-4 hover:underline hover:text-white/90 transition-colors",
        glass: "bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/20 text-white/80 hover:from-white/25 hover:to-white/10 hover:text-white/90 transition-all",
        glow: "bg-gradient-to-br from-blue-500/30 to-cyan-500/15 backdrop-blur-2xl border border-blue-400/40 text-white shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] hover:from-blue-400/40 hover:to-cyan-400/20 transition-all",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 rounded-xl px-4",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
