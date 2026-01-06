# Marketplace Backend API Specifications

This document outlines the API specifications for the HighFlow Marketplace, incorporating "High Quality" features similar to JetBrains and n8n marketplaces.

## 1. Item Types & Data Models

We need to support three distinct item types. The `itemType` enum should include:

- `project` (Full value-add workflows/agents)
- `operator` (Reusable functional units)
- `script_template` (Reusable code snippets for Script Tasks)

### 1.1 Marketplace Item Model (Enhanced)

The `MarketplaceItem` response object should include:

```typescript
interface MarketplaceItem {
    id: string;
    type: 'project' | 'operator' | 'script_template';
    name: string;
    summary: string; // Short description for cards
    description: string; // Full Markdown description
    author: {
        id: string;
        name: string;
        avatarUrl?: string;
        isVerified: boolean; // For "Official" or trusted authors
    };
    price: number; // 0 for free
    currency: 'credit';

    // Statistics
    stats: {
        installCount: number;
        viewCount: number;
        rating: number; // 0-5
        reviewCount: number;
    };

    // Versioning
    version: string; // Latest version
    lastUpdated: string; // ISO Date

    // Visuals
    iconUrl?: string;
    previewImages: string[]; // Screenshots

    // Workflow Specifics (For 'project' type)
    previewGraph?: {
        nodes: any[];
        edges: any[];
    }; // Lightweight JSON for rendering a read-only graph preview

    // Metadata
    tags: string[];
    categories: string[];
    compatibility: {
        minAppVersion: string;
        requiredOperators?: string[]; // IDs of operators needed
    };

    // User Specific (Added for UI state)
    isOwned: boolean; // true if the current user has purchased/saved this item
}
```

## 2. API Endpoints Enhancements

### 2.1 List Items (Enhanced Filtering)

`GET /v1/marketplace/items`

**Additional Query Params:**

- `tags`: Array of strings (e.g., `['automation', 'image-gen']`)
- `authorId`: Filter by specific author
- `minPrice`, `maxPrice`: For price filtering

### 2.2 Item Details (Graph Preview)

`GET /v1/marketplace/items/:id`

**Response Enhancement:**

- Must return `previewGraph` if `type === 'project'`. This allows the frontend to render an interactive node graph (like n8n) before purchase.
- `changelog`: Array of `{ version, date, notes }`.
- `reviews`: Top 3 reviews preview.

### 2.3 Reviews & Ratings

`GET /v1/marketplace/items/:id/reviews`

- Pagination support.
- Returns `{ reviews: Review[], stats: { averageRating, distribution } }`.

### 2.4 My Library

`GET /v1/marketplace/library`

- Returns items purchased/installed by the current user.
- Useful for "Re-install" or "Update" flows.

## 3. Submission Flow (Publisher)

`POST /v1/marketplace/submissions`

- Should accept `previewGraph` payload for projects.
- Should accept `scriptContent` for `script_template`.

## 4. Frontend-Backend Contract

- **Graph Preview**: The backend should store a sanitized version of the workflow graph (removing sensitive secrets/env vars) to be served publicly as `previewGraph`.
- **Search**: Backend should implement fuzzy search on `name`, `summary`, and `tags`.
