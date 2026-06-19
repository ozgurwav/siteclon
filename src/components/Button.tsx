import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary';
  children: ReactNode;
  className?: string;
}

export function Button({ variant = 'primary', children, className, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-[#051A24] text-white shadow-[0_1px_2px_0_rgba(5,26,36,0.1),0_4px_4px_0_rgba(5,26,36,0.09),0_9px_6px_0_rgba(5,26,36,0.05),0_17px_7px_0_rgba(5,26,36,0.01),0_26px_7px_0_rgba(5,26,36,0),inset_0_2px_8px_0_rgba(255,255,255,0.5)]",
    secondary: "bg-white text-[#051A24] shadow-[0_0_0_0.5px_rgba(0,0,0,0.05),0_4px_30px_rgba(0,0,0,0.08)]",
    tertiary: "bg-white text-[#051A24] shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_2px_8px_0_rgba(255,255,255,0.5)]"
  };

  return (
    <button
      className={cn(
        "rounded-full px-7 py-3 text-sm md:text-base font-medium transition-transform active:scale-95",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
