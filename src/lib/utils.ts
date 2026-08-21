import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Vantra's design tokens (index.css) aren't part of Tailwind's default palette,
// so tailwind-merge needs to be told about them to correctly resolve conflicts
// like `bg-surface` (a component default) vs. `bg-[#1a1206]` (a caller override).
const customColors = [
  'paper',
  'surface',
  'surface-2',
  'ink',
  'ink-muted',
  'border-hair',
  'accent',
  'accent-ink',
  'lavender',
  'sky',
  'mint',
  'positive',
  'negative',
  'watch',
]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'bg-color': [{ bg: customColors }],
      'text-color': [{ text: customColors }],
      'border-color': [{ border: customColors }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
