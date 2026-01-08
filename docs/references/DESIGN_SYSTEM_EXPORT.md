# Backend Admin Design System Guide (HighFlow Style)

This document outlines the design principles, color palette, typography, and component patterns used in the HighFlow Desktop App. It is intended to guide the redevelopment of the backend admin system (Vue.js) to match the application's premium aesthetic.

**Core Technology Stack**:

- **Framework**: Vue 3 (Composition API)
- **Styling**: Tailwind CSS (v3+)
- **Icons**: Heroicons (Outline/Solid) or Phosphor Icons
- **Dark Mode Strategy**: Class-based (`dark` class on html/body), CSS variables for semantic colors.

---

## 1. Design Philosophy

- **Premium & Modern**: Use subtle gradients, glassmorphism (where appropriate), and refined borders.
- **Dark Mode First**: The system feels native in dark mode (`gray-900` backgrounds).
- **Depth & Hierarchy**: Use shadows (`shadow-sm`, `shadow-lg`) and borders (`border-gray-200/800`) to define structure.
- **Visual Feedback**: Interactive elements must have hover states (`transition-colors`, `hover:bg-gray-800`).

---

## 2. Color Palette & Theming (HSL Variables)

We use CSS variables mapped to Tailwind colors for theme switching. Ensure your `tailwind.config.js` extends these colors.

**Base Variables (root/dark):**
| Variable | Light (HSL) | Dark (HSL) | Usage |
| :--- | :--- | :--- | :--- |
| `--background` | `0 0% 100%` (White) | `222.2 84% 4.9%` (Dark Blue-Gray) | App background |
| `--foreground` | `222.2 84% 4.9%` | `210 40% 98%` (Off-white) | Primary text |
| `--card` | `0 0% 100%` | `222.2 84% 4.9%` | Card background |
| `--popover` | `0 0% 100%` | `222.2 84% 4.9%` | Dropdowns/Modals |
| `--primary` | `221.2 83.2% 53.3%` (Blue) | `217.2 91.2% 59.8%` | Primary buttons/links |
| `--secondary` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Secondary buttons |
| `--muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Muted backgrounds |
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | Borders |
| `--input` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | Input borders |
| `--destructive`| `0 84.2% 60.2%` | `0 62.8% 30.6%` | Delete/Error actions |

**Tailwind Config (`tailwind.config.js`):**

```javascript
theme: {
  extend: {
    colors: {
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      // ... map other variables similarly
    }
  }
}
```

---

## 3. Layout Patterns

### App Shell

The standard layout consists of a fixed Sidebar and a scrollable Main Content area.

- **Sidebar**:
    - Width: `w-64` (Expanded), `w-16` (Collapsed)
    - Color: `bg-gray-950` (Darker than main content)
    - Border: `border-r border-gray-800`
    - Text: `text-gray-400` (Inactive), `text-white` (Active/Hover)
- **Main Content**:
    - Color: `bg-gray-50` (Light Mode), `bg-gray-900` (Dark Mode)
- **Header (Optional)**:
    - Color: `bg-white dark:bg-gray-900`
    - Border: `border-b border-gray-200 dark:border-gray-800`

### Typography

- **Font Stack**: System fonts (`-apple-system`, `Inter`, `Segoe UI`, `Roboto`).
- **Headings**: `font-bold text-gray-900 dark:text-white`.
    - H1: `text-2xl`
    - H2: `text-lg`
- **Body**: `text-sm text-gray-500 dark:text-gray-400` for descriptions.

---

## 4. UI Components

### Cards

Used for grouping content (Settings sections, Items).

```html
<div
    class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700"
>
    <!-- Content -->
</div>
```

### Buttons

**Primary**:

```html
<button
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
>
    Save Changes
</button>
```

**Secondary / Outline**:

```html
<button
    class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
>
    Cancel
</button>
```

**Ghost / Menu Item**:

```html
<button
    class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
>
    <Icon class="w-5 h-5" />
    <span>Menu Item</span>
</button>
```

### Inputs & Forms

```html
<input
    type="text"
    class="w-full px-3 py-2 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-400"
    placeholder="Enter value..."
/>
```

### Status Badges

Used for status indicators (Active, Pending, Tags).

```html
<!-- Green/Success -->
<span
    class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
>
    Active
</span>

<!-- Blue/Info -->
<span
    class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
>
    Processed
</span>
```

### Gradients

Use subtle gradients for avatars or feature highlights.

- **Brand Gradient**: `bg-gradient-to-br from-blue-500 to-purple-500`

---

## 5. Micro-interactions

- **Hover**: Almost all interactive elements should have `hover:bg-{color}` and `transition-colors`.
- **Transitions**: Use `duration-200` or `duration-300` for smooth state changes (sidebar toggle, color shifts).

## 6. Example Layout Structure (Vue)

```vue
<template>
    <div class="flex h-screen bg-gray-900 text-white">
        <!-- Sidebar -->
        <aside class="w-64 bg-gray-950 border-r border-gray-800 flex flex-col">
            <div class="h-14 flex items-center px-4 border-b border-gray-800">
                <span class="font-bold">Admin Panel</span>
            </div>
            <nav class="p-2 space-y-1">
                <!-- Nav Items -->
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 overflow-auto bg-gray-900">
            <header class="h-14 border-b border-gray-800 flex items-center px-6 bg-gray-900">
                <h1 class="font-semibold">Dashboard</h1>
            </header>
            <div class="p-6">
                <!-- Page Content -->
            </div>
        </main>
    </div>
</template>
```
