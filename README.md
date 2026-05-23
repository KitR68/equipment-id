# Equipment ID

**AI-powered equipment nameplate identification.** Upload a photograph of
an industrial equipment dataplate and the app will identify the
manufacturer, model number, serial number, date code, and decoded
manufacture date — learning new manufacturer serial-number formats as it
goes and sharing them across devices via a cloud knowledge base.

## Stack

| Layer    | Technology                                                          |
| -------- | ------------------------------------------------------------------- |
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS 4 · shadcn/ui            |
| Vision   | OpenAI Chat Completions (vision-capable model, called from browser)  |
| QR codes | `jsQR` decoded client-side before the OpenAI call                    |
| API      | Azure Functions v4 (Node.js, managed by Static Web Apps)             |
| Storage  | Azure Table Storage via `@azure/data-tables`                         |
| Hosting  | Azure Static Web Apps                                                |

## How it works

1. The user uploads a JPG/PNG of an equipment nameplate **or** types the
   manufacturer / model / serial / date code into the Manual Entry tab.
2. For uploads, the browser scans the image for a QR code with `jsQR`
   first, then sends the photo (and any decoded QR data) to the OpenAI
   vision model. The model returns structured JSON: manufacturer, model,
   serial, date code, any printed date, and raw OCR text.
3. The app loads the **shared knowledge base** from
   `GET /api/knowledge` and merges it with the local copy in
   `localStorage`.
   - **Manufacturer known.** The stored serial-number format is fed
     back to the model and the serial is decoded deterministically.
   - **Manufacturer new.** The model is asked to research the
     manufacturer's published serial-number conventions. The returned
     format is saved both to `localStorage` and to Azure Table Storage
     (via `POST /api/knowledge`) so every device benefits next time.
4. Results — Manufacturer, Model, Serial, Date Code, Manufacture Date,
   QR data, and the learned serial format — are displayed as stamped
   dataplate cards.

If the API is unreachable (e.g. running the static site without the
Functions app), the frontend falls back to the local-only knowledge base
automatically and shows a "local only" status pill.

## OpenAI API key

The OpenAI key never leaves the browser. Open the **Settings** dialog
(top-right) and paste the key. The default model is `gpt-4o`. Any
vision-capable chat model works (`gpt-4o`, `gpt-4o-mini`,
`gpt-4-turbo`, …).

The key is stored in `localStorage` under `equipment-id:settings:v1`
and is sent only to `https://api.openai.com/v1/chat/completions` from
the user's device.

## API

Endpoints (auto-prefixed with `/api` by Static Web Apps):

| Method | Path                            | Description                                |
| ------ | ------------------------------- | ------------------------------------------ |
| GET    | `/api/knowledge`                | Returns all learned manufacturer entries. |
| POST   | `/api/knowledge`                | Upserts an entry (body: `ManufacturerEntry`). |
| DELETE | `/api/knowledge?manufacturer=X` | Deletes the entry whose name slug matches X. |

The function code lives in `api/src/`. The single HTTP-triggered
function is registered with the Functions Node.js v4 programming model
in `api/src/index.js` and routed under `/api/knowledge`.

## Required Application Setting (Azure)

The Azure Functions app needs one configuration value:

```
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=<account>;AccountKey=<key>;EndpointSuffix=core.windows.net
```

In the Azure portal:

1. Open your Static Web App resource.
2. Go to **Configuration** → **Application settings**.
3. Click **Add**, set **Name** to `AZURE_STORAGE_CONNECTION_STRING`,
   paste the connection string for the storage account that should hold
   the `ManufacturerKnowledge` table, and **Save**.

The Functions runtime exposes this as `process.env.AZURE_STORAGE_CONNECTION_STRING`.
The function lazily creates the `ManufacturerKnowledge` table on first
request, so no manual provisioning is required.

For local development, copy `api/local.settings.json.example` to
`api/local.settings.json` and fill in the same value.

## Local development

```bash
# Frontend dev server
pnpm install
pnpm dev          # http://localhost:3000

# (optional) Run the Functions app locally
cd api
npm install
func start        # requires Azure Functions Core Tools v4
```

When running both, configure the SWA CLI (or proxy `/api/*` to
`http://localhost:7071/api/*`) so the frontend can reach the Functions
host.

## Production build

```bash
pnpm build
```

Build output is written to `dist/`. A postbuild step flattens Vite's
default `dist/public` directory and copies `staticwebapp.config.json`
into `dist/`.

## Deploying to Azure Static Web Apps

1. Connect this repository to an Azure Static Web App.
2. Set the build configuration to:
   - **App location:** `/`
   - **API location:** `api`
   - **Output location:** `dist`
   - **Build command:** `pnpm install && pnpm build` (or use the
     default workflow generated by Azure).
3. Add `AZURE_STORAGE_CONNECTION_STRING` to **Configuration →
   Application settings**.
4. Open the deployed site and add your OpenAI API key in **Settings**.

`staticwebapp.config.json` ships SPA fallback to `index.html`, excludes
`/api/*` from the fallback rewrite, allows anonymous calls to the
managed Functions, and sets sane cache + security headers.

## Project structure

```
api/
  host.json
  package.json
  src/
    index.js        ← Functions v4 registration (route: /api/knowledge)
    knowledge.js    ← Azure Table Storage CRUD handler
client/
  src/
    components/     ← UploadZone, ManualEntryForm, FieldCard, SettingsDialog, shadcn/ui
    lib/
      openai.ts          ← Vision + serial-decoding API calls
      storage.ts         ← localStorage settings + knowledge base
      cloudKnowledge.ts  ← Frontend client for /api/knowledge with offline fallback
      qr.ts              ← jsQR client-side QR decoding
    pages/Home.tsx       ← Tabs (upload / manual), results
    index.css            ← Industrial Dossier theme tokens
scripts/
  postbuild.mjs   ← Flattens dist/public → dist for Azure SWA
staticwebapp.config.json
```
