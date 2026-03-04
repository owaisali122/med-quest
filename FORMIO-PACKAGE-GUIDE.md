# Form.io Custom Components — Package Guide

This document covers everything related to Form.io: how the designer is embedded in the CMS admin panel, how Bootstrap CSS is isolated, how custom components are structured, and how the private npm package is created, published, and consumed.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Required Packages](#2-required-packages)
3. [Embedding the Form.io Designer in Payload Admin](#3-embedding-the-formio-designer-in-payload-admin)
4. [Form and Wizard Display Configuration](#4-form-and-wizard-display-configuration)
5. [Bootstrap CSS Isolation](#5-bootstrap-css-isolation)
6. [Custom Form.io Components](#6-custom-formio-components)
7. [Package Setup from Scratch](#7-package-setup-from-scratch)
8. [Publishing a Release](#8-publishing-a-release)
9. [Installing the Package in Any Project](#9-installing-the-package-in-any-project)
10. [Local Development Workflow](#10-local-development-workflow)

---

## 1. Architecture

All custom Form.io component definitions, the component registry, the builder configuration, and `FormRenderer` live in a **separate private npm package** (`@your-org/formIoBuilder`). The CMS project and any other consuming project install this package — they never define components locally.

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────────┐
│  CMS Project                        │     │  formIoBuilder (private pkg) │
│                                     │     │                                         │
│  - FormBuilderField (Payload admin) │◄────│  - All Form.io component definitions    │
│  - Bootstrap + formio CSS routes     │     │  - Component registry + builder config  │
│    (serve CSS; package fetches)     │     │  - BootstrapProvider (CSS scoping)      │
└─────────────────────────────────────┘     │  - FormRenderer (React component)       │
                                             └─────────────────────────────────────────┘
                                                           ▲
                                 ┌─────────────────────────┘
                                 │  Any other consuming app
                                 │  (portal, citizen-facing, etc.)
                                 └───────────────────────────────
```

**CMS project owns:**
- `FormBuilderField` — the Payload custom field component that renders the Form.io builder inside the admin panel (imports the package for `BootstrapProvider`, `registerCustomComponents`, and `getBuilderConfig`).
- Two Next.js API routes that serve Bootstrap and Form.io CSS to the browser (`/api/bootstrap-css`, `/api/formio-css`). The package’s `BootstrapProvider` fetches from these URLs (configurable via `configure()`).

**The package owns:**
- Every Form.io component definition.
- The component registry (`registerCustomComponents`).
- The builder sidebar configuration (`getBuilderConfig`).
- `BootstrapProvider` — loads and scopes Bootstrap and Form.io CSS so they do not affect the host app (e.g. Payload admin). Depends on Form.io and is therefore part of the Form.io package.
- `FormRenderer` — the React component used by consuming apps to render a saved form.

---

## 2. Required Packages

### In the CMS project

```bash
pnpm add formiojs
pnpm add bootstrap@5.3.8
pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.0.0
```

`bootstrap@5.3.8` is mandatory — this exact version is what Form.io's bootstrap template and `@formio/bootstrap3` expect. It is served to the browser via the scoped CSS API routes described in Section 5.

### In any other consuming project (e.g. a citizen-facing portal)

```bash
pnpm add formiojs
pnpm add bootstrap@5.3.8
pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.0.0
```

---

## 3. Embedding the Form.io Designer in Payload Admin

The Form.io builder is embedded in the Payload admin panel as a **custom field component** on the `schema` JSON field of the `Forms` collection.

### Collection field config (`src/collections/Forms.ts`)

The `schema` field replaces its default JSON editor with `FormBuilderField`:

```typescript
{
  name: 'schema',
  type: 'json',
  required: true,
  defaultValue: { display: 'form', components: [] },
  admin: {
    components: {
      Field: '/components/admin/FormBuilderField',
    },
  },
}
```

Payload resolves the path `/components/admin/FormBuilderField` relative to `src/` (set via `admin.importMap.baseDir` in `payload.config.ts`).

### FormBuilderField (`src/components/admin/FormBuilderField.tsx`)

This is a `'use client'` React component that:

1. Reads and writes the JSON schema via `useField` from `@payloadcms/ui`.
2. Dynamically imports `registerCustomComponents` and `getBuilderConfig` **from the external package** (not from local files) to avoid SSR errors:

   ```typescript
   const { registerCustomComponents, getBuilderConfig } =
     await import('@your-org/formIoBuilder')
   ```

3. Calls `registerCustomComponents()` — this registers all custom Form.io components with `Formio.Components.setComponent()` before the builder is created.
4. Creates a `Formio.FormBuilder` instance mounted on a `<div ref>`. The `.ready` promise resolves to the inner `WizardBuilder` or `WebformBuilder` depending on `schema.display`.
5. Listens to builder events (`change`, `saveComponent`, `addComponent`, `removeComponent`, `updateComponent`) and syncs the updated schema back to the Payload field via `setValue()`. The schema is deep-cloned before saving so Payload detects a new reference and enables the Save button.
6. Provides a **"Display as"** dropdown (Form / Wizard) — switching it destroys and re-initialises the builder with the new display type.
7. Wraps everything in `<BootstrapProvider>` (imported from the package) so Bootstrap CSS is available only within the builder area.

### Component registry (inside the package — `src/registry.ts`)

`registerCustomComponents()`:
- Dynamically imports `formiojs`.
- Exposes `Formio` on `window` and `global` so Form.io's internal component lookups work.
- Imports each custom component definition and registers it via `Formio.Components.setComponent(typeKey, WrapperClass)`.
- Returns the `Formio` instance so the caller can access `FormioInstance.FormBuilder`.

`getBuilderConfig()` returns the builder sidebar configuration:

```typescript
{
  template: 'bootstrap',   // Required for Wizard tab bar and "+ PAGE" button
  builder: {
    basic: {
      default: true,
      components: {
        // standard Form.io components:
        textfield: true, textarea: true, number: true,
        password: true, checkbox: true, email: true,
        select: true, radio: true, button: true,
        currency: true, datetime: true,
        // all custom components from the package:
        documentUpload: true,
        documentViewer: true,
        searchableDropdown: true,
        ssn: true,
        tabnavigationbuttons: true,
        tabprogress: true,
        fieldReference: true,
        appDetailRef: true,
      },
    },
    advanced: false,
    layout: {
      default: true,
      components: { htmlelement: true, content: true, columns: true, panel: true, well: true },
    },
    data: { default: false },
    premium: false,
  },
}
```

### FormRenderer (from the package)

To render a saved form in any React application:

```tsx
import { FormRenderer } from '@your-org/formIoBuilder/FormRenderer'

<FormRenderer
  schema={form.schema}
  onSubmit={(data) => console.log(data)}
  readOnly={false}
  submission={{ firstName: 'Jane' }}   // optional prefill
/>
```

`FormRenderer` calls `registerCustomComponents()` once internally (via a singleton promise) so custom components are always available when the form renders.

---

## 4. Form and Wizard Display Configuration

Form.io supports two display modes, controlled by the `display` property in the JSON schema:

| Value | Form.io builder class | Result |
|-------|-----------------------|--------|
| `'form'` | `WebformBuilder` | Single-page form |
| `'wizard'` | `WizardBuilder` | Multi-page wizard with a tab per page |

### How it is stored

The `schema` field stores the entire Form.io JSON including `display`:

```json
{ "display": "form", "components": [] }
```

```json
{
  "display": "wizard",
  "components": [
    { "type": "panel", "title": "Page 1", "components": [] }
  ]
}
```

### "Display as" dropdown

`FormBuilderField` derives the current display type from the saved schema:

```tsx
const displayType = useMemo<DisplayType>(() => {
  if (value?.display === 'wizard' || value?.display === 'form') return value.display
  return 'form'
}, [value])
```

When the user changes the dropdown, the schema is updated and the builder is destroyed and re-initialised:

```typescript
const handleDisplayChange = (newDisplay: 'form' | 'wizard') => {
  const newSchema = cloneSchema({ ...currentSchema, display: newDisplay })
  setValue(newSchema)       // persist to Payload
  reinitBuilder(newSchema)  // recreate the builder with the new type
}
```

`display` must be set on the schema **before** `FormBuilder` is constructed. Form.io reads it to decide which builder class to instantiate:

```typescript
const formBuilder = new FormBuilder(container, { ...schema, display: 'wizard' }, builderConfig)
const instance = await formBuilder.ready
// instance is now a WizardBuilder
```

### Why `template: 'bootstrap'` is required for Wizard

Without it, the Wizard builder does not render the tab bar or the **"+ PAGE"** button that adds new pages. `template: 'bootstrap'` activates the Bootstrap-flavoured wizard UI bundled with `@formio/bootstrap3`.

### Guard against invalid display values

Before creating the builder, any unrecognised display value is corrected to `'form'`:

```typescript
if (schemaWithDisplay.display !== 'form' && schemaWithDisplay.display !== 'wizard') {
  schemaWithDisplay.display = 'form'
}
```

---

## 5. Bootstrap CSS Isolation

### The problem

Form.io's builder and renderer depend on Bootstrap for layout (grid, tabs, cards, nav, buttons). Payload CMS has its own admin styles. Importing Bootstrap globally overwrites Payload's CSS and breaks the admin UI.

### Solution: runtime CSS scoping

Bootstrap selectors are **rewritten at runtime** so they only apply inside specific wrapper classes, never leaking into the Payload admin layout.

### API routes that serve CSS

Two Next.js routes in the CMS project read CSS from `node_modules` and return it with long-lived cache headers.

**`src/app/api/bootstrap-css/route.ts`**

```typescript
import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const css = await readFile(
    join(process.cwd(), 'node_modules/bootstrap/dist/css/bootstrap.min.css'),
    'utf-8'
  )
  return new NextResponse(css, {
    headers: {
      'Content-Type': 'text/css',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
```

**`src/app/api/formio-css/route.ts`** — same pattern, reads `formiojs/dist/formio.full.min.css`.

The CMS (or any host app) keeps these two routes; **`BootstrapProvider`** lives in the Form.io package and fetches CSS from URLs configured via `configure()` (see below).

### BootstrapProvider (in the package — `src/components/BootstrapProvider.tsx`)

`BootstrapProvider` is part of the Form.io package because it is tied to Form.io’s Bootstrap-based builder and modal/dialog DOM structure. Consuming projects (including the CMS) import it from the package and wrap the Form.io builder (or renderer) with it.

**Configuration**

Add CSS URLs to the registry config so `BootstrapProvider` knows where to fetch styles:

```typescript
// In the CMS project (e.g. in a layout or before rendering the admin)
import { configure } from '@your-org/formIoBuilder'

configure({
  formsListUrl: '/api/forms',
  bootstrapCssUrl: '/api/bootstrap-css',   // optional; default '/api/bootstrap-css'
  formioCssUrl: '/api/formio-css',          // optional; default '/api/formio-css'
})
```

If you use the default route paths in the CMS, you can omit `bootstrapCssUrl` and `formioCssUrl`.

**Behaviour (on mount)**

1. Fetches Bootstrap CSS from the configured `bootstrapCssUrl` (e.g. `/api/bootstrap-css`).
2. Rewrites every selector to be scoped to the required containers:
   ```
   .nav-tabs { ... }
   →
   .bootstrap-scope .nav-tabs,
   .formio-modal .nav-tabs,
   .formio-dialog .nav-tabs,
   .formio-edit-form .nav-tabs,
   .formio-builder-dialog .nav-tabs,
   .formio-builder .nav-tabs,
   .formbuilder .nav-tabs { ... }
   ```
   `@media`, `@keyframes`, `@import`, and `@supports` rules are left untouched.
3. Injects the rewritten CSS as a `<style id="form-builder-bootstrap-scoped">` tag.
4. Appends containment styles:
   ```css
   .bootstrap-scope {
     isolation: isolate;
     contain: layout style paint;
   }
   .formio-modal, .formio-dialog, .formio-edit-form, .formio-builder-dialog {
     isolation: isolate;
   }
   ```
5. Fetches Form.io CSS from the configured `formioCssUrl` and injects it as a second `<style>` tag. Form.io’s own CSS is already self-scoped — no rewriting needed.
6. Tracks active instances via `window.__formBuilderBootstrapCount`. Styles are injected on the first mount and removed when the last instance unmounts.
7. Renders children inside `<div className="bootstrap-scope formio-builder formbuilder">`.

**Implementation (package — `src/components/BootstrapProvider.tsx`)**

```tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'

const SCOPE_SELECTORS = [
  '.bootstrap-scope',
  '.formio-modal',
  '.formio-dialog',
  '.formio-edit-form',
  '.formio-builder-dialog',
  '.formio-builder',
  '.formbuilder',
].join(', ')

function scopeBootstrapCss(css: string): string {
  const skipPattern = /@(?:media|keyframes|import|supports)\b/
  const lines = css.split('\n')
  const out: string[] = []
  let inRule = false
  let currentSelectors: string[] = []
  let currentBody = ''

  for (const line of lines) {
    if (skipPattern.test(line.trim()) || line.trim().startsWith('@')) {
      if (inRule) {
        out.push(currentSelectors.map((s) => `${SCOPE_SELECTORS} ${s}`).join(', ') + currentBody)
        inRule = false
      }
      out.push(line)
      continue
    }

    const open = line.indexOf('{')
    if (open !== -1) {
      const selectors = line.slice(0, open).split(',').map((s) => s.trim()).filter(Boolean)
      const body = line.slice(open)
      if (selectors.length) {
        const scoped = selectors.map((s) => `${SCOPE_SELECTORS} ${s}`).join(', ')
        out.push(scoped + body)
      } else {
        out.push(line)
      }
      inRule = line.indexOf('}') === -1
      continue
    }

    if (inRule) {
      out.push(line)
      if (line.includes('}')) inRule = false
    } else {
      out.push(line)
    }
  }

  return out.join('\n')
}

declare global {
  interface Window {
    __formBuilderBootstrapCount?: number
  }
}

function getBootstrapCssUrl(): string {
  return (typeof window !== 'undefined' && (window as any).__formioConfig?.bootstrapCssUrl) ?? '/api/bootstrap-css'
}

function getFormioCssUrl(): string {
  return (typeof window !== 'undefined' && (window as any).__formioConfig?.formioCssUrl) ?? '/api/formio-css'
}

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const isFirst = (window.__formBuilderBootstrapCount ?? 0) === 0
    window.__formBuilderBootstrapCount = (window.__formBuilderBootstrapCount ?? 0) + 1

    if (!isFirst) {
      setMounted(true)
      return () => {
        window.__formBuilderBootstrapCount! -= 1
      }
    }

    const styleId = 'form-builder-bootstrap-scoped'
    const formioStyleId = 'form-builder-formio-css'

    Promise.all([
      fetch(getBootstrapCssUrl()).then((r) => r.text()),
      fetch(getFormioCssUrl()).then((r) => r.text()),
    ]).then(([bootstrapCss, formioCss]) => {
      const scoped = scopeBootstrapCss(bootstrapCss)
      const extra = `
        .bootstrap-scope { isolation: isolate; contain: layout style paint; }
        .formio-modal, .formio-dialog, .formio-edit-form, .formio-builder-dialog { isolation: isolate; }
      `
      let el = document.getElementById(styleId)
      if (!el) {
        el = document.createElement('style')
        el.id = styleId
        document.head.appendChild(el)
      }
      el.textContent = scoped + extra

      let formioEl = document.getElementById(formioStyleId)
      if (!formioEl) {
        formioEl = document.createElement('style')
        formioEl.id = formioStyleId
        document.head.appendChild(formioEl)
      }
      formioEl.textContent = formioCss
      setMounted(true)
    })

    return () => {
      window.__formBuilderBootstrapCount! -= 1
      if (window.__formBuilderBootstrapCount === 0) {
        document.getElementById(styleId)?.remove()
        document.getElementById(formioStyleId)?.remove()
      }
    }
  }, [])

  return <div className="bootstrap-scope formio-builder formbuilder">{mounted ? children : null}</div>
}
```

**Exposing config to the client**

The package’s `configure()` should store `bootstrapCssUrl` and `formioCssUrl` so the browser can read them. For example, in the registry store the config and set it on `window.__formioConfig` when running in the browser (e.g. in `BootstrapProvider` or when the package first loads on the client). Alternatively, have `configure()` accept a second argument `{ client: true }` and set `window.__formioConfig` from the same config object the CMS passes. The implementation above reads `window.__formioConfig.bootstrapCssUrl` and `window.__formioConfig.formioCssUrl`; the package’s `configure()` implementation should set `window.__formioConfig` in the browser so that `BootstrapProvider` can use these URLs. Document this in the package README.

### Why multiple scope prefixes are needed

Form.io renders edit dialogs and modals directly under `<body>`, outside the `.bootstrap-scope` div. Prefixing with `.formio-modal`, `.formio-dialog`, `.formio-edit-form`, and `.formio-builder-dialog` ensures those elements still receive Bootstrap styles. The `formio-builder` and `formbuilder` classes on the wrapper div cover the builder canvas itself.

---

## 6. Custom Form.io Components

### Component structure

Each component consists of two parts:

**1. Definition class** — a plain TypeScript class, no Form.io runtime import needed:

- `static schema()` — the default JSON schema for the component instance.
- `static builderInfo` — title, icon, group, and position in the builder sidebar.
- `static editForm()` — the configuration panel shown when a placed component is clicked in the builder.
- (Optional) prototype methods for runtime rendering and behaviour.

**2. Registration wrapper** — created inside `registerCustomComponents()` in `src/registry.ts`:

- Extends the correct Form.io base component (`file`, `component`, `select`, `textfield`, etc.).
- Delegates `schema`, `builderInfo`, and `editForm` to the definition class.
- Adds any runtime constructor logic (e.g. mapping custom props to Form.io internals).
- Registered via `Formio.Components.setComponent(typeKey, WrapperClass)`.

### Component inventory

| Component | Type Key | Base Class | Purpose |
|-----------|----------|------------|---------|
| Document Upload | `documentUpload` | `file` | File upload with configurable endpoint, PDF-first |
| Document Viewer | `documentViewer` | `component` | Displays a document from a configurable endpoint |
| Searchable Dropdown | `searchableDropdown` | `select` | API-backed searchable dropdown, multi-select support |
| SSN | `ssn` | `textfield` | SSN input with `XXX-XX-XXXX` masking, toggle visibility, validation |
| Tab Navigation Buttons | `tabnavigationbuttons` | `component` | Previous / Next / Save & Exit / Submit for wizard pages |
| Tab Progress | `tabprogress` | `component` | Progress bar for multi-page wizard forms |
| Field Reference | `fieldReference` | `component` | Mirrors another field's schema by key (designer-only) |
| Schema Reference | `schemaReference` | `component` | References a field schema by key |
| App Detail Ref | `appDetailRef` | `component` | Embeds a preview of another form from the Forms API (designer-only) |
| Address Search | `addressSearch` | `component` | Address search with configurable API |

### Example — definition class

```typescript
// src/components/DocumentUpload.ts  (inside the package)
export class DocumentUploadComponent {
  static schema(overrides?: any) {
    return {
      type: 'documentUpload',
      label: 'Document Upload',
      key: 'document',
      input: true,
      storage: 'url',
      uploadEndpoint: '',   // configured per-instance in the edit form
      fileMaxSize: '10MB',
      allowMultiple: false,
      ...overrides,
    }
  }

  static get builderInfo() {
    return {
      title: 'Document Upload',
      group: 'basic',
      icon: 'upload',
      weight: 25,
      schema: DocumentUploadComponent.schema(),
    }
  }

  static editForm() {
    return {
      components: [
        { type: 'textfield', key: 'label',          label: 'Label',           input: true },
        { type: 'textfield', key: 'uploadEndpoint', label: 'Upload Endpoint', required: true },
        { type: 'textfield', key: 'fileMaxSize',    label: 'Max File Size',   input: true },
        { type: 'checkbox',  key: 'allowMultiple',  label: 'Allow Multiple Files', input: true },
      ],
    }
  }
}
```

### Example — registration wrapper

```typescript
// inside registerCustomComponents() in src/registry.ts  (inside the package)
const FileComponent = Formio.Components.components.file

const DocumentUpload = class extends FileComponent {
  static schema(overrides?: any) { return DocumentUploadComponent.schema(overrides) }
  static get builderInfo()       { return DocumentUploadComponent.builderInfo }
  static editForm()              { return DocumentUploadComponent.editForm() }

  constructor(component: any, options: any, data: any) {
    if (!component.storage) component.storage = 'url'
    if (!component.url && component.uploadEndpoint) component.url = component.uploadEndpoint
    super(component, options, data)
  }
}

Formio.Components.setComponent('documentUpload', DocumentUpload)
```

### Adding a new component

1. Create `src/components/MyComponent.ts` in the package with `schema`, `builderInfo`, and `editForm`.
2. Add the registration wrapper inside `registerCustomComponents()` in `src/registry.ts`.
3. Add the type key to `basic.components` inside `getBuilderConfig()`.
4. Export the definition class from `src/index.ts`.
5. Build, bump version, and publish (see Sections 8 and 9).

---

## 7. Package Setup from Scratch

### Package structure

```
formIoBuilder/              # Private GitHub repository
├── src/
│   ├── components/
│   │   ├── BootstrapProvider.tsx      # Scoped Bootstrap/Form.io CSS loader
│   │   ├── DocumentUpload.ts
│   │   ├── DocumentViewer.ts
│   │   ├── SearchableDropdown.ts
│   │   ├── SSN.ts
│   │   ├── TabNavigationButtons.ts
│   │   ├── TabProgressComponent.ts
│   │   ├── FieldReference.ts
│   │   ├── SchemaReferenceField.ts
│   │   ├── AppDetailRef.ts
│   │   ├── AddressSearch.ts
│   │   └── FormRenderer.tsx
│   ├── registry.ts                    # registerCustomComponents() + getBuilderConfig() + configure()
│   ├── styles/
│   │   ├── SearchableDropdown.module.scss
│   │   └── AddressSearch.module.scss
│   └── index.ts                       # Public entry point
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── .gitignore
```

### Step 1 — Create a private repository on GitHub

Go to **GitHub → New repository** → set visibility to **Private** → name it `formIoBuilder` → do not initialise with a README → click **Create repository**.

### Step 2 — Scaffold locally

```bash
mkdir formIoBuilder
cd formIoBuilder
git init
git remote add origin git@github.com:your-org/formIoBuilder.git
```

Initialise `package.json` interactively:

```bash
pnpm init
```

### Step 3 — Install dev dependencies

```bash
# Build tool
pnpm add -D tsup

# TypeScript compiler
pnpm add -D typescript

# React types (needed to compile FormRenderer.tsx)
pnpm add -D @types/react @types/react-dom

# Peer dependencies installed as devDeps so local builds and type-checking work
pnpm add -D formiojs react react-dom
```

### Step 4 — Edit `package.json`

```json
{
  "name": "@your-org/formIoBuilder",
  "version": "1.0.0",
  "description": "Shared Form.io custom components for builder and renderer",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./FormRenderer": {
      "import": "./dist/components/FormRenderer.mjs",
      "require": "./dist/components/FormRenderer.js",
      "types": "./dist/components/FormRenderer.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "formiojs": "^4.21.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "formiojs": "^4.21.7",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0"
  }
}
```

> `formiojs`, `react`, and `react-dom` appear in both `peerDependencies` and `devDependencies`. `peerDependencies` signals to consumers that they must provide these packages themselves. `devDependencies` makes them available in the package repo for local builds and type-checking.

### Step 5 — Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 6 — Create `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/FormRenderer': 'src/components/FormRenderer.tsx',
    'components/BootstrapProvider': 'src/components/BootstrapProvider.tsx',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['formiojs', 'react', 'react-dom'],
  splitting: false,
  treeshake: true,
})
```

### Step 7 — Create `.gitignore`

```
node_modules/
dist/
*.tsbuildinfo
```

### Step 8 — Create the configurable registry (`src/registry.ts`)

The registry must not hard-code any project-specific URLs. Accept configuration via `configure()`:

```typescript
interface RegistryConfig {
  formsListUrl?: string
  bootstrapCssUrl?: string
  formioCssUrl?: string
}

let _config: RegistryConfig = {}

export function configure(config: RegistryConfig): void {
  _config = config
  if (typeof window !== 'undefined') {
    (window as any).__formioConfig = {
      bootstrapCssUrl: _config.bootstrapCssUrl ?? '/api/bootstrap-css',
      formioCssUrl: _config.formioCssUrl ?? '/api/formio-css',
    }
  }
}

function getFormsListUrl(): string {
  return _config.formsListUrl ?? '/api/forms'
}

export async function registerCustomComponents() {
  const FormioModule = await import('formiojs')
  const Formio = (FormioModule as any).default || FormioModule

  if (typeof window !== 'undefined') (window as any).Formio = Formio
  if (typeof global !== 'undefined') (global as any).Formio = Formio

  if (Formio.Components?.setComponent) {
    // Register each component here (see Section 6 for the wrapper pattern)
  }

  return Formio
}

export function getBuilderConfig(overrides?: Record<string, unknown>) {
  return {
    template: 'bootstrap',
    builder: {
      basic: { default: true, components: { /* ... all component type keys */ } },
      advanced: false,
      layout: { default: true, components: { /* ... */ } },
      data: { default: false },
      premium: false,
    },
    ...overrides,
  }
}
```

### Step 9 — Create the public entry point (`src/index.ts`)

```typescript
export { DocumentUploadComponent }       from './components/DocumentUpload'
export { DocumentViewerComponent }       from './components/DocumentViewer'
export { SearchableDropdownComponent }   from './components/SearchableDropdown'
export { SSNComponent }                  from './components/SSN'
export { TabNavigationButtonsComponent } from './components/TabNavigationButtons'
export { TabProgressComponent }          from './components/TabProgressComponent'
export { SchemaReferenceFieldComponent } from './components/SchemaReferenceField'
export { AppDetailRefComponent }         from './components/AppDetailRef'
export { AddressSearchComponent }        from './components/AddressSearch'

export { registerCustomComponents, getBuilderConfig, configure } from './registry'

export { BootstrapProvider }              from './components/BootstrapProvider'
export { FormRenderer }                  from './components/FormRenderer'
export type { FormRendererProps }        from './components/FormRenderer'
```

### Step 10 — Build and verify

```bash
pnpm build
pnpm typecheck
```

`dist/` now contains CJS (`.js`), ESM (`.mjs`), and TypeScript declaration (`.d.ts`) files.

---

## 8. Publishing a Release

No npm registry is needed. Publishing means pushing a **Git tag** — consuming projects install from GitHub using that tag.

### First release

```bash
pnpm build

git add .
git commit -m "feat: initial release v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

### Subsequent releases

Use `pnpm version` to bump `package.json` and create the Git tag in one step:

```bash
pnpm version patch    # 1.0.0 → 1.0.1  (bug fix)
pnpm version minor    # 1.0.0 → 1.1.0  (new component or non-breaking feature)
pnpm version major    # 1.0.0 → 2.0.0  (breaking change)
```

Build and push with the new tag:

```bash
pnpm build
git push origin main --follow-tags
```

`--follow-tags` pushes both the commit and the new tag in one command.

---

## 9. Installing the Package in Any Project

Because the repository is private, every machine that installs the package needs **SSH access** to the GitHub account that owns it.

### One-time SSH setup (per machine)

Add your SSH key to GitHub if you have not already, then verify:

```bash
ssh -T git@github.com
# Hi your-username! You've successfully authenticated...
```

### Install a specific release

Always pin to a tag — never use a floating branch name:

```bash
pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.0.0
```

This writes to the consuming project's `package.json`:

```json
"dependencies": {
  "@your-org/formIoBuilder": "github:your-org/formIoBuilder#v1.0.0"
}
```

### Update to a newer release

```bash
pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.1.0
```

Or edit the tag directly in `package.json` and run `pnpm install`.

### Usage in a consuming project

```typescript
import {
  registerCustomComponents,
  getBuilderConfig,
  configure,
} from '@your-org/formIoBuilder'

import { FormRenderer } from '@your-org/formIoBuilder/FormRenderer'

// Call once at startup — tells the package where the Forms API is
configure({ formsListUrl: '/api/forms' })
```

### Dependency summary

| Package | In the package | In every consuming project |
|---------|---------------|---------------------------|
| `formiojs` | `devDependencies` + `peerDependencies` | `dependencies` |
| `bootstrap` | not needed | `dependencies` (5.3.8) |
| `react`, `react-dom` | `devDependencies` + `peerDependencies` | already present |
| `tsup` | `devDependencies` | not needed |
| `typescript` | `devDependencies` | already present |

---

## 10. Local Development Workflow

When building a new component you do not want to push a tag and reinstall the package for every change. Use a local link instead.

### Option 1 — `pnpm add ...@link:<path>` (one command)

From the **consuming project** (e.g. the CMS), add the package by pointing at your local package directory:

```bash
cd C:\Projects\test\med-quest
pnpm add @your-org/formIoBuilder@link:C:\Projects\test\formio-util
```

Replace the path with your actual package folder (e.g. `C:\Projects\test\formio-uil` if the folder is named `formio-uil`). The package `name` in the linked folder’s `package.json` must match the left-hand side (e.g. `@your-org/formIoBuilder`). Run `pnpm dev` in the package repo so `dist/` stays up to date; the CMS will use the linked build. To restore the published version later, run `pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.0.0` (or the tag you use).

### Option 2 — `pnpm link` (global symlink)

Creates a symlink from the consuming project's `node_modules` directly into your local `dist/` folder.

**Register the package globally:**

```bash
# Inside the package repo
pnpm link --global
```

**Link into the consuming project:**

```bash
# Inside the CMS (or any other consuming project)
pnpm link --global @your-org/formIoBuilder
```

**Run both in parallel:**

```bash
# Terminal A — package repo: rebuilds dist/ on every file save
pnpm dev

# Terminal B — consuming project: dev server picks up changes via the symlink
pnpm dev
```

**Unlink when done:**

```bash
# In the consuming project
pnpm unlink @your-org/formIoBuilder

# In the package repo
pnpm unlink --global

# Restore the published version
pnpm install
```

### Option 3 — `file:` path

Edit the consuming project's `package.json` temporarily:

```json
"dependencies": {
  "@your-org/formIoBuilder": "file:../formIoBuilder"
}
```

```bash
pnpm install
```

Run `pnpm dev` in the package repo to keep `dist/` up to date. When done, revert to the tag and reinstall:

```json
"@your-org/formIoBuilder": "github:your-org/formIoBuilder#v1.1.0"
```

```bash
pnpm install
```

> Use `pnpm add ...@link:<path>` for a one-command setup. Use `pnpm link` when you switch between local and published versions frequently. Use `file:` for extended local development sessions.

### End-to-end workflow for a new component

```
1.  Create src/components/MyComponent.ts  in the package repo
2.  Register it in src/registry.ts
3.  Export it from src/index.ts
4.  Start package in watch mode:    pnpm dev               (package repo)
5.  Link into the consuming project: pnpm add @your-org/formIoBuilder@link:../formio-util  (from CMS), or pnpm link --global (package repo) then pnpm link --global @your-org/formIoBuilder (CMS)
6.  Start the CMS dev server:        pnpm dev               (CMS)
7.  Test in the admin — iterate until satisfied
8.  Unlink
9.  Bump version:                    pnpm version minor     (package repo)
10. Build and publish:               pnpm build && git push origin main --follow-tags
11. Update consuming project:        pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#vX.Y.Z
```
