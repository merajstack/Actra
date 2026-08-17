# Actra Developer & Agent Universal Guidelines

This document provides a comprehensive architectural map, component breakdown, and universal development principles for the Actra browser project. Future developers and AI agents must refer to this document before attempting to modify or extend the codebase.

---

## 1. Project Architecture & Tech Stack

Actra is an autonomous AI-powered desktop browser built on a hybrid architecture.

### Tech Stack
- **Frontend Core**: React 19, TypeScript, Vite, TailwindCSS v4.
- **Backend/Native Core**: Electron (Main process handles IPC, Windowing, and BrowserViews).
- **Data Persistence**: `electron-store` (for history, bookmarks, settings, memory).
- **AI Integration**: Google GenAI / Groq API (Planner), Google Workspace API (Docs, Sheets, Gmail).

---

## 2. Process Breakdown

### The Main Process (`electron/main.js`)
The Node.js/Electron backend that orchestrates the heavy lifting.
- **`TabManager` (`electron/tab-manager.js`)**: Crucial for natively mounting web content. It listens to renderer bounds (`tab:setUIChromeHeight`) to securely overlay `BrowserView`/`WebContentsView` underneath the React UI Chrome.
- **Data Stores**: `BookmarkStore`, `HistoryStore`, `DownloadManager` persist and manage user activity globally.
- **AI Subsystem Engine**: The central brain is housed here. It utilizes `TaskManager`, `PlannerEngine`, and `ModelGateway` to decompose user prompts into actionable steps. `ApprovalEngine` and `PolicyEngine` evaluate high-risk actions.
- **Google Workspace (`electron/google-auth.js`)**: Manages OAuth2 flows to enable AI agents to send emails, write to sheets, and generate documents.

### The Renderer Process (`src/App.tsx`)
The React application responsible for rendering the "Browser Chrome" (the UI wrapper surrounding the web content).
- **Global Layout (`index.css` & `App.tsx`)**: Actra is structurally bound to the native window frame. `html, body, #root` are strictly `100%` width/height with `overflow: hidden`. `App.tsx` utilizes `absolute inset-0 flex flex-col`. **Rule:** Never introduce wrappers with margins or fixed viewports (`vw`/`vh`) that could result in "iframing" or nested-box visuals.
- **Chrome Components**:
  - `TabStrip.tsx`: Manages draggable tabs and window controls.
  - `Toolbar.tsx`: The Omnibox (address bar), navigation controls, and extension/menu entry points.
  - `BookmarksBar.tsx`: Quick access links.

### The Content Layer (`src/components/BrowserContent.tsx`)
When web content is not being rendered directly by Electron's native `BrowserView`, Actra falls back to a React-managed container (`BrowserContent.tsx`).
- **Internal Routes**: Handles `chrome://newtab`, `chrome://history`, `chrome://settings`, etc.
- **Iframe Fallback**: External pages rendered here are housed in a `flex-1 block w-full h-full` `iframe`. **Rule:** The iframe MUST maintain `block` display to eliminate inline baseline undergaps.
- **Custom Search Mock**: Detects standard search patterns and renders a custom "ActraSearch" UI rather than embedding Google/DuckDuckGo directly.

---

## 3. Data Models (`src/types.ts`)

- **Tab**: Tracks `id`, `title`, `url`, `isLoading`, and `isIncognito`. State is synced bi-directionally between `TabManager` and `App.tsx`.
- **Bookmark & HistoryItem**: Tracks URLs, titles, and timestamps for localized search and suggestion autocomplete in the Omnibox.
- **AITask & AIApprovalRequest**: Tracks the lifecycle of AI background jobs (`pending`, `planning`, `executing`, `awaiting_approval`).

---

## 4. Universal Design & Layout Rules

1. **Native Cohesion**: The browser UI must feel like a native macOS application. Use `bg-[#FDFBF7]` (warm beige) for light mode chrome, and `bg-zinc-950` for Incognito. Avoid heavy drop shadows or nested borders around web content.
2. **Dynamic Scaling**: The application utilizes Tailwind Flexbox heavily. Use `flex-1` for containers that need to stretch to fill the remaining space (like `BrowserContent`). Never use hardcoded pixel heights for structural layout unless modeling specific browser components (e.g., `h-[46px]` for the Toolbar).
3. **Component Simplicity**: Do NOT intercept domain-specific rendering (e.g., YouTube or GitHub). External websites must be rendered using standard web standards through the iframe/BrowserView pipeline without custom React overlays.

---

## 5. Adding New Features

- **Adding a standard UI page**: If adding an internal page (e.g., `chrome://passwords`), add the route in `App.tsx` and render it as a view replacing `BrowserContent`.
- **Adding an AI Skill**: Add the tool definition to `electron/main.js` inside the `ai:execute-command` IPC handler, and implement the executor in `google-workspace.js` or `browser-actions.js`.
- **Handling State**: Actra uses React `useState` lifted to `App.tsx` for core state. When passing state down, prefer direct props. For deep nesting, evaluate if the component can be flattened before reaching for Context.
