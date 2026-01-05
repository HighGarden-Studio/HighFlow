# Marketplace Integration Guide

This document assists frontend developers in integrating the HighFlow Marketplace APIs.
It covers listing items, purchasing, and submission flows.

## Base Configuration

- **Base URL**: `/v1` (relative to API host)
- **Authentication**: Bearer Token required for non-public endpoints
  - `Authorization: Bearer <session-token>`

## 1. Workflows vs Projects

> [!IMPORTANT]
> The term "Workflow" (backend entity) is exposed as **"Project"** in the API paths and response objects to align with user-facing terminology.
>
> - API Path: `/v1/projects` (instead of `/v1/workflows`)
> - Response ID: `projectId` (instead of `userWorkflowId`)

## 2. Browsing Marketplace

### 2.1 List Items

Retrieve a paginated list of marketplace items using various filters.

**Endpoint**: `GET /v1/marketplace/items`
**Access**: Public

**Query Parameters**:

- `category`: Filter by category (e.g., `ai-ml`, `productivity`)
- `itemType`: `project` or `operator`
- `search`: Keyword search
- `sortBy`: `popular`, `recent`, `rating`, `price`
- `limit`: Page size (default 20)
- `offset`: Pagination offset

**React Query Example**:

```javascript
/* frontend/src/api/marketplace.ts */
export const useMarketplaceItems = (params) => {
  return useQuery(["marketplace", params], async () => {
    const { data } = await axios.get("/v1/marketplace/items", { params });
    return data;
  });
};
```

### 2.2 Item Details

Get the full details including markdown descriptions and metadata.

**Endpoint**: `GET /v1/marketplace/items/:id`
**Access**: Public

**Response Fields**:

- `longDescription`: Main content (Markdown)
- `readme`: Setup instructions (Markdown)
- `changelog`: Version history (Markdown)
- `previewImages`: Array of image URLs
- `metadata`: File stats and dependencies

## 3. Purchasing

Purchasing an item copies the marketplace content into the user's personal workspace as a new **Project**.

**Endpoint**: `POST /v1/marketplace/items/:id/purchase`
**Access**: Authenticated

**API Call**:

```javascript
const response = await axios.post(`/v1/marketplace/items/${itemId}/purchase`, {
  idempotencyKey: "mut-uuid-v4",
});

// Response
console.log(response.data);
/*
{
  "projectId": "wf_12345", // Use this ID to redirect user to the project editor
  "creditsCharged": 100,
  "message": "Purchase successful"
}
*/
```

## 4. Submitting to Marketplace

Users can publish their projects (Workflows) to the marketplace.

**Endpoint**: `POST /v1/marketplace/submissions`
**Access**: Authenticated

**Payload**:

```json
{
  "workflowId": "wf_local_123" /* The local Project ID */,
  "itemType": "project",
  "category": "automation",
  "suggestedPrice": 50,
  "submissionNote": "Ready for review",
  "clientVersion": "1.0.0"
}
```

## 5. Reviews

Users can review items they have purchased.

**Endpoint**: `POST /v1/marketplace/items/:id/reviews`

**Payload**:

```json
{
  "rating": 5,
  "comment": "Great tool!"
}
```
