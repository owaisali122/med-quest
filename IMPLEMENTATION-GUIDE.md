# Payload CMS — Implementation Guide

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Project Structure](#2-project-structure)
3. [Creating a Form in the Admin Panel](#3-creating-a-form-in-the-admin-panel)
4. [Form Listing](#4-form-listing)
5. [API Reference](#5-api-reference)

---

## 1. Initial Setup

### Scaffolding

The project was created using the official Payload CMS 3.x blank template:

```bash
npx create-payload-app@latest poc --template blank
```

### Environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/<DatabaseName>
PAYLOAD_SECRET=YOUR_LONG_RANDOM_SECRET
```

Generate a strong `PAYLOAD_SECRET` (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`PAYLOAD_SECRET` must remain stable — changing it invalidates all existing sessions and JWTs.

### Core stack

| Component | Package / Version |
|-----------|-------------------|
| CMS | `payload` 3.71.1 |
| Framework | `next` 15.4.10 (App Router) |
| Database | `@payloadcms/db-postgres` (PostgreSQL) |
| Rich-text editor | `@payloadcms/richtext-lexical` |
| Image processing | `sharp` |
| React | 19.2.1 |
| TypeScript | 5.7.3 |

### Main config (`src/payload.config.ts`)

```typescript
export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Forms, FormSubmissions],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
  }),
  sharp,
  plugins: [],
})
```

---

## 2. Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── bootstrap-css/route.ts        # Serves scoped Bootstrap CSS
│   │   ├── formio-css/route.ts           # Serves Form.io CSS
│   │   └── forms/
│   │       ├── by-slug/route.ts          # GET form by slug
│   │       ├── submit/route.ts           # POST form submission
│   │       └── draft/
│   │           ├── route.ts              # POST save draft
│   │           ├── resume/route.ts       # GET resume draft
│   │           └── [submissionId]/route.ts
│   └── (payload)/                        # Payload admin panel routing
├── collections/
│   ├── Users.ts                          # Auth collection
│   ├── Media.ts                          # Upload collection
│   ├── Forms.ts                          # Form schemas (built with Form.io designer)
│   └── FormSubmissions.ts                # Submitted and draft form data
├── components/
│   └── admin/
│       ├── FormBuilderField.tsx          # Embeds the Form.io designer in the admin
│       └── FormBuilderField.module.scss
├── config/
│   └── formio.ts                         # Form.io API URL config
├── types/
│   ├── formio-builder.ts
│   └── formio.d.ts
├── payload.config.ts
└── payload-types.ts
```

> All Form.io custom component definitions, the component registry, **BootstrapProvider**, and **FormRenderer** live in the **`@your-org/formIoBuilder`** private npm package — not in this project. Install the package and call `configure({ formsListUrl: '/api/forms', bootstrapCssUrl: '/api/bootstrap-css', formioCssUrl: '/api/formio-css' })` (e.g. in your app layout) so the package can load scoped Bootstrap/Form.io CSS.
> See [`FORMIO-PACKAGE-GUIDE.md`](./FORMIO-PACKAGE-GUIDE.md) for full details.

### Linking the Form.io package for local development

To use your local `formIoBuilder` (or `formio-util` / `formio-uil`) directory instead of the published package, run from the **CMS project root** (e.g. `med-quest`):

```bash
cd C:\Projects\test\med-quest
pnpm add @your-org/formIoBuilder@link:C:\Projects\test\formio-util
```

Replace `@your-org/formIoBuilder` with the exact `name` from the linked package’s `package.json`, and `C:\Projects\test\formio-util` with the path to your local package folder (e.g. `formio-uil` if that’s the directory name). After linking, run `pnpm dev` in the package directory so `dist/` stays in sync; then run `pnpm dev` in the CMS to test. To switch back to the published version, run `pnpm add @your-org/formIoBuilder@github:your-org/formIoBuilder#v1.0.0` (or the desired tag).

---

## 3. Creating a Form in the Admin Panel

### Collections involved

| Collection | Purpose |
|------------|---------|
| `Forms` | Stores the form title, slug, status, and the Form.io JSON schema |
| `FormSubmissions` | Stores submitted data and saved drafts linked to a form |

Both are grouped under **Form Management** in the admin sidebar.

### Steps to create a form

1. Log in to the Payload admin panel (`/admin`).
2. In the left sidebar under **Form Management**, click **Forms**.
3. Click **Create New**.
4. Fill in the required fields:
   - **Title** — display name of the form (e.g. `Benefits Application`).
   - **Slug** — URL-safe identifier, must be unique (e.g. `benefits-application`). This is used by consuming apps to load the correct form.
   - **Description** — optional, for internal reference only.
5. Use the **Form Builder** below the fields to visually design the form:
   - Drag components from the right-hand sidebar onto the canvas.
   - Click any placed component to open its configuration panel (label, validation, options, etc.).
   - Switch between **Form** (single page) and **Wizard** (multi-page with tabs) using the **Display as** dropdown above the builder.
6. Expand the **Settings** group to configure:
   - **Submit Button Text** — label on the submit button (default: `Submit`).
   - **Success Message** — message shown to the user after a successful submission.
   - **Allow Multiple Submissions** — whether a user can submit more than once.
7. Set **Status** to **Draft** while designing. Change it to **Published** when the form is ready to accept submissions.
8. Click **Save**.

### Form fields reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | Text | Yes | Human-readable name |
| `slug` | Text | Yes | Unique URL key — used by the API |
| `description` | Textarea | No | Internal only |
| `status` | Select | Yes | `draft` or `published` |
| `schema` | JSON | Yes | Form.io JSON schema — edited via the visual builder |
| `settings.submitButtonText` | Text | No | Defaults to `Submit` |
| `settings.successMessage` | Textarea | No | Shown on successful submit |
| `settings.allowMultipleSubmissions` | Checkbox | No | Defaults to `true` |

---

## 4. Form Listing

Only forms with `status = published` are intended for consumption by external applications. Forms in `draft` status are visible only inside the admin panel.

### Viewing forms in the admin

The Forms list view shows four columns by default: **Title**, **Slug**, **Status**, and **Updated At**. You can filter or sort by any column.

### Fetching published forms via the API

The Payload built-in REST API exposes all collections automatically. To fetch only published forms:

```
GET /api/forms?where[status][equals]=published
```

This returns a paginated list. Each document includes `id`, `title`, `slug`, `status`, `schema`, `settings`, and timestamps.

---

## 5. API Reference

All API routes are under the base URL of the deployed application (e.g. `https://your-cms-domain.com`).

### Payload built-in REST endpoints

These are provided automatically by Payload for every collection.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/forms` | List all forms (supports `where`, `limit`, `sort` query params) |
| `GET` | `/api/forms/:id` | Get a single form by its numeric ID |

**Fetch all published forms:**

```
GET /api/forms?where[status][equals]=published&limit=100
```

**Response:**

```json
{
  "docs": [
    {
      "id": 1,
      "title": "Benefits Application",
      "slug": "benefits-application",
      "status": "published",
      "schema": { "display": "wizard", "components": [ ... ] },
      "settings": {
        "submitButtonText": "Submit",
        "successMessage": "Thank you for your submission!",
        "allowMultipleSubmissions": true
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T00:00:00.000Z"
    }
  ],
  "totalDocs": 1,
  "limit": 100,
  "page": 1,
  "totalPages": 1
}
```

---

### Custom application endpoints

These routes are defined in `src/app/api/forms/`.

#### Get form by slug

```
GET /api/forms/by-slug?slug={slug}
```

Returns the form `id`, `title`, `slug`, and `status` for the matching slug. Use this when you know the slug but not the numeric ID.

**Response:**

```json
{
  "success": true,
  "form": {
    "id": 1,
    "slug": "benefits-application",
    "title": "Benefits Application",
    "status": "published"
  }
}
```

---

#### Submit a form

```
POST /api/forms/submit
Content-Type: application/json
```

Only accepts submissions for forms with `status = published`.

**Request body:**

```json
{
  "formId": 1,
  "data": {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com"
  }
}
```

You may pass `formSlug` instead of `formId`:

```json
{
  "formSlug": "benefits-application",
  "data": { ... }
}
```

**Response:**

```json
{
  "success": true,
  "submissionId": 42,
  "message": "Form submitted successfully"
}
```

---

#### Save a draft

```
POST /api/forms/draft
Content-Type: application/json
```

Saves partial form data without marking the submission as complete. If a draft already exists for the same form and email address, it is updated rather than duplicated.

**Request body:**

```json
{
  "formId": 1,
  "data": {
    "firstName": "Jane",
    "email": "jane@example.com"
  },
  "currentTab": "1"
}
```

**Response:**

```json
{
  "success": true,
  "submissionId": 38,
  "message": "Draft saved successfully"
}
```

---

#### Resume a draft

```
GET /api/forms/draft/resume?formId={id}&email={email}
```

Returns the most recent draft for a given form and email so the user can continue where they left off.

#### Get / update a specific draft

```
GET  /api/forms/draft/:submissionId
PUT  /api/forms/draft/:submissionId
```
