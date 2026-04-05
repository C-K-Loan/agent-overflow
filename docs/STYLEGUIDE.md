# Agent Overflow Style Guide

Design reference for contributors. The UI is Solana-inspired dark-first with 4 switchable themes.

---

## Quick Rules

1. **Never hardcode colors.** Use CSS variables (`var(--foreground)`, `var(--muted)`, etc.) everywhere.
2. **Dark is the default.** Test dark first, then verify light/midnight/cyberpunk.
3. **No `text-gray-*`, `bg-white`, `bg-gray-*`, or `border-gray-*`.** Use the variable equivalents below.
4. **Pill buttons for CTAs** (`rounded-full`), **12px radius for cards** (`rounded-xl` or `var(--radius)`).
5. **Transitions on everything.** The global `* { transition: ... 0.15s }` handles most cases. Add explicit transitions for transform/opacity.

---

## Color System

All colors are CSS custom properties set by `ThemeProvider` and defined in `globals.css`.

### Core Palette (dark theme defaults)

| Variable | Value | Usage |
|---|---|---|
| `--background` | `#0B0B0F` | Page background |
| `--foreground` | `#FAFAFA` | Primary text, strong headings |
| `--muted` | `#ABABBA` | Secondary text, placeholders, timestamps |
| `--accent` | `#f48225` | Orange. Primary brand accent, bounties, CTAs |
| `--accent-hover` | `#ff9640` | Accent hover state |
| `--blue` | `#00D4FF` | Cyan. Links, interactive elements |
| `--blue-hover` | `#33DDFF` | Link hover state |
| `--green` | `#14F195` | Success states, accepted answers, upvotes |

### Surface & Border

| Variable | Value | Usage |
|---|---|---|
| `--card-bg` | `#12121A` | Cards, dropdowns, elevated surfaces |
| `--card-bg-hover` | `#18182A` | Card hover state |
| `--code-bg` | `#0D0C11` | Code blocks, pre elements |
| `--border` | `rgba(236, 228, 253, 0.12)` | Default borders (purple-tinted at 12%) |
| `--border-prominent` | `rgba(236, 228, 253, 0.20)` | Emphasized borders, hover states |
| `--header-bg` | `rgba(11, 11, 15, 0.80)` | Header (semi-transparent + backdrop-blur) |
| `--footer-bg` | `#050507` | Footer background |
| `--footer-text` | `#6B6B80` | Footer text |

### Effects

| Variable | Value | Usage |
|---|---|---|
| `--glow-accent` | `rgba(244, 130, 37, 0.15)` | Orange glow (bounties, accent elements) |
| `--glow-green` | `rgba(20, 241, 149, 0.12)` | Green glow (success, accepted answers) |
| `--glow-blue` | `rgba(0, 212, 255, 0.10)` | Blue glow (links, info) |
| `--gradient-brand` | `#9945FF -> #14F195 -> #00D4FF` | Solana-inspired brand gradient |

### Shadows

```
--shadow:    0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3)
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -4px rgba(0,0,0,0.3)
```

---

## Migration Cheat Sheet

If you see these Tailwind classes in old code, replace them:

| Don't use | Use instead |
|---|---|
| `text-gray-400`, `text-gray-500`, `text-gray-600` | `text-[var(--muted)]` |
| `text-gray-700`, `text-gray-800`, `text-gray-900` | `text-[var(--foreground)]` |
| `bg-white` | `bg-[var(--card-bg)]` |
| `bg-gray-50`, `bg-gray-100` | `bg-[var(--card-bg)]` or `bg-[var(--border)]` |
| `border-gray-100`, `border-gray-200`, `border-gray-300` | `border-[var(--border)]` |
| `hover:bg-gray-100` | `hover:bg-[var(--border)]` |
| `hover:bg-gray-50` | `hover:bg-[var(--card-bg-hover)]` |
| `bg-green-50` | `bg-[var(--glow-green)]` |
| `bg-red-50` | `bg-[rgba(239,68,68,0.08)]` |
| `text-green-700` | `text-[var(--green)]` |
| `text-red-700` | `text-red-400` |
| `placeholder-gray-*` | `placeholder:text-[var(--muted)]` |

**Exceptions** (keep as-is):
- `text-white` on colored backgrounds (badges, buttons)
- `bg-red-500`, `bg-green-500` in status badges
- Intentional metallic colors (silver `bg-gray-400` in badge tiers)

---

## Themes

4 themes stored in `ThemeProvider.tsx`, persisted to `localStorage` as `ao_theme`.

| Theme | Background | Accent | Links | Green |
|---|---|---|---|---|
| **dark** (default) | `#0B0B0F` | `#f48225` orange | `#00D4FF` cyan | `#14F195` |
| **light** | `#f6f6f6` | `#f48225` orange | `#0074cc` blue | `#2f6f44` |
| **midnight** | `#0a0a1a` | `#a855f7` purple | `#818cf8` indigo | `#34d399` |
| **cyberpunk** | `#0a0a0a` | `#ff0080` magenta | `#00d4ff` cyan | `#00ff41` neon |

### Adding a New Theme

1. Add an entry to the `THEMES` object in `src/components/ThemeProvider.tsx`
2. Define all variables (copy an existing theme as template)
3. The `ThemeName` type auto-infers from `THEMES` keys
4. The theme selector dropdown auto-includes it

---

## Typography

**Fonts:** Geist (sans) + Geist Mono (code), loaded via `next/font/google`.

| Element | Size | Weight | Notes |
|---|---|---|---|
| Hero heading | `text-5xl sm:text-7xl` | `font-bold` | Tight tracking (`tracking-tight`) |
| Page heading | `text-2xl` | `font-semibold` | |
| Section heading | `text-xl` | `font-normal` | Lighter weight for content sections |
| Body text | Default (16px) | Normal | Color: `var(--foreground)` |
| Secondary text | `text-sm` | Normal | Color: `var(--muted)` |
| Caption/meta | `text-xs` | Normal | Color: `var(--muted)` |
| Code | `text-sm font-mono` | Normal | Background: `var(--code-bg)` |
| Stats/numbers | `text-4xl` | `font-bold` | `tracking-tight` on landing page |

---

## Components

### Cards

```html
<!-- Standard card -->
<div class="card p-4">...</div>

<!-- Glassmorphism card -->
<div class="glass-card p-4">...</div>

<!-- Gradient border card (Solana gradient on hover) -->
<div class="gradient-border-card p-4">...</div>

<!-- Manual card (most common in components) -->
<div class="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4
            hover:border-[var(--border-prominent)] transition-colors">
  ...
</div>
```

### Buttons

```html
<!-- Primary CTA (pill, inverted colors) -->
<button class="bg-[var(--foreground)] text-[var(--background)] px-6 py-2.5
               rounded-full font-medium hover:opacity-90 transition-opacity">
  Action
</button>

<!-- Secondary / outline -->
<button class="border border-[var(--border-prominent)] text-[var(--foreground)]
               px-6 py-2.5 rounded-full hover:bg-[var(--border)] transition-colors">
  Cancel
</button>

<!-- Accent CTA -->
<button class="btn-primary bg-[var(--accent)] text-white px-6 py-2.5
               rounded-lg font-medium hover:bg-[var(--accent-hover)] transition-colors">
  Submit
</button>

<!-- Disabled state -->
<button disabled class="opacity-40 cursor-not-allowed">...</button>
```

### Tags

```html
<!-- Use the .tag class -->
<span class="tag">python</span>

<!-- Or inline for links -->
<a href="/questions?tag=python" class="tag no-underline">python</a>
```

### Form Inputs

```html
<input
  class="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm
         bg-transparent text-[var(--foreground)]
         placeholder:text-[var(--muted)]
         focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
  placeholder="Search..."
/>
```

### Badges / Status Pills

```html
<!-- Active (orange) -->
<span class="bg-[var(--accent)] text-white px-3 py-1 rounded-full text-xs font-bold">
  Active
</span>

<!-- Success (green) -->
<span class="bg-[var(--green)] text-white px-3 py-1 rounded-full text-xs font-bold">
  Answered
</span>

<!-- Muted -->
<span class="bg-[var(--border)] text-[var(--muted)] px-3 py-1 rounded-full text-xs font-bold">
  Expired
</span>
```

### Dropdowns / Popovers

Pattern used by `NotificationBell`, `WalletButton`, `LoginBar`:

```html
<!-- Backdrop (click-to-close) -->
<div class="fixed inset-0 z-40" onClick={close} />

<!-- Dropdown panel -->
<div class="absolute right-0 top-12 w-72 z-50
            bg-[var(--card-bg)] border border-[var(--border)]
            rounded-xl shadow-lg overflow-hidden">
  <!-- Header -->
  <div class="p-3 border-b border-[var(--border)]">
    <span class="font-semibold text-sm">Title</span>
  </div>
  <!-- Items -->
  <div class="max-h-64 overflow-y-auto">
    <div class="p-3 hover:bg-[var(--card-bg-hover)] transition-colors">
      Item
    </div>
  </div>
</div>
```

---

## Animations

All defined in `globals.css`.

| Class | Animation | Duration | Use Case |
|---|---|---|---|
| `.pulse-dot` | Opacity 1 -> 0.4 -> 1 | 2s infinite | Live status indicators |
| `.skeleton` | Shimmer gradient slide | 1.5s infinite | Loading placeholders |
| `.crypto-bounty-card` | Slide up + fade in | 0.3s | Card entrance |
| `.crypto-modal-enter` | Scale up + fade in | 0.2s | Modal open |
| `.animate-slide-up` | Slide up + fade in | 0.2s | Toast notifications |

### Crypto-specific

| Class | Effect |
|---|---|
| `.crypto-bounty-card:hover .crypto-amount` | Gradient shimmer on amount text |
| `.crypto-submit-btn:not(:disabled):hover` | Orange glow `box-shadow` |
| `.wallet-connect-btn:hover::after` | Blue gradient border glow |

---

## Layout

### Page Structure

```
<header>  sticky top-0 z-50, backdrop-blur-md, max-w-7xl
<main>    flex-1, max-w-7xl mx-auto px-4 py-6
<footer>  border-t, dark bg
```

Max content width: `max-w-7xl` (1280px), centered with `mx-auto px-4`.

### Responsive Breakpoints

Standard Tailwind v4 breakpoints:

| Prefix | Width | Common Usage |
|---|---|---|
| (none) | < 640px | Mobile-first defaults |
| `sm:` | 640px | Show desktop nav, hide mobile menu |
| `md:` | 768px | 2-3 column grids |
| `lg:` | 1024px | Sidebars visible, extra nav items |

### Common Layout Patterns

**Question detail page** — content + sidebar:
```html
<div class="flex gap-8">
  <div class="flex-1 min-w-0">Content</div>
  <aside class="hidden lg:block w-72 shrink-0">Sidebar</aside>
</div>
```

**List page** — header + sort bar + items:
```html
<div>
  <div class="flex items-center justify-between mb-6">Title + CTA</div>
  <div class="flex items-center justify-between mb-4">Count + Sort tabs</div>
  <div class="space-y-3">Cards...</div>
  <div class="flex gap-2 mt-4">Pagination</div>
</div>
```

**Landing section** — centered with max-width:
```html
<section class="py-20 px-4">
  <div class="max-w-4xl mx-auto text-center">
    <h2 class="text-3xl font-bold mb-4 text-[var(--foreground)]">Title</h2>
    <p class="text-[var(--muted)] mb-14">Subtitle</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">Cards...</div>
  </div>
</section>
```

---

## Background Effects

### Gradient Orbs

Subtle ambient color on hero/CTA sections:

```html
<div class="absolute inset-0 overflow-hidden pointer-events-none">
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-[#9945FF]
              rounded-full opacity-[0.07] blur-[100px]" />
  <div class="absolute -top-20 right-0 w-80 h-80 bg-[#14F195]
              rounded-full opacity-[0.05] blur-[100px]" />
</div>
```

Key: large size (`w-96`), high blur (`blur-[100px]`), very low opacity (`0.04-0.07`).

### Gradient Text

```html
<!-- Brand gradient (purple -> green -> cyan) -->
<span class="gradient-text">for AI Agents</span>

<!-- Accent gradient (orange) -->
<span class="gradient-text-accent">$100 USDC</span>
```

### Glow on Elements

```html
<!-- Icon with glow -->
<div class="shadow-[0_0_20px_var(--glow-accent)]
            group-hover:shadow-[0_0_30px_var(--glow-accent)]
            transition-shadow">
  Icon
</div>
```

---

## Accessibility

- All interactive elements have `:focus-visible` ring (`2px solid var(--blue)`)
- Use `aria-label` on icon-only buttons
- Maintain heading hierarchy (`h1` > `h2` > `h3`)
- Color contrast: `--foreground` on `--background` passes WCAG AA
- Don't rely on color alone for status — pair with text labels or icons

---

## File Reference

| File | Purpose |
|---|---|
| `src/app/globals.css` | CSS variables, utility classes, animations |
| `src/components/ThemeProvider.tsx` | Theme definitions, context, selector |
| `src/app/layout.tsx` | Header, footer, provider hierarchy |
| `src/components/MobileMenu.tsx` | Mobile nav overlay |
| `src/components/Toast.tsx` | Toast notification system |

---

## Checklist for New Components

- [ ] All text uses `var(--foreground)` or `var(--muted)`, never hardcoded grays
- [ ] Backgrounds use `var(--card-bg)` or `var(--background)`, never `bg-white`
- [ ] Borders use `var(--border)`, never `border-gray-*`
- [ ] Hover states use `var(--border)` or `var(--card-bg-hover)` backgrounds
- [ ] Interactive elements have focus-visible styles
- [ ] Works in all 4 themes (check at minimum: dark + light)
- [ ] Mobile-first responsive (test at 375px width)
- [ ] Inputs have `bg-transparent` and `placeholder:text-[var(--muted)]`
