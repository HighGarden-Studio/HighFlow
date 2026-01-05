# Marketplace API Integration Guide

This document maps the frontend's expected API contracts to backend requirements.
The frontend implementation is located in `src/renderer/api/marketplace.ts`.

## Base Configuration

- **Base URL**: `http://localhost:8081` (default) or `VITE_BACKEND_URL` env var.
- **Content-Type**: `application/json`

## Authentication

All protected endpoints require a Bearer token in the Authorization header.
The token is obtained via the Google OAuth flow implemented in the client.

```http
Authorization: Bearer <session-token>
```

| Status Code | Meaning      | Action                                             |
| ----------- | ------------ | -------------------------------------------------- |
| `401`       | Unauthorized | Client will log the user out and require re-login. |
| `403`       | Forbidden    | User lacks permission for the specific action.     |

---

## 1. Marketplace Items

### 1.1 List Items

Retrieve a paginated list of marketplace items (projects, operators).

- **Endpoint**: `GET /v1/marketplace/items`
- **Auth**: Optional (Public items visible to all)

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by `MarketplaceCategory` |
| `itemType` | string | `project` or `operator` |
| `search` | string | Keyword search (name, description, tags) |
| `limit` | number | Default: 50 |
| `offset` | number | Default: 0 |
| `sortBy` | string | `popular`, `recent`, `rating`, `price` |

**Response (`MarketplaceItemsResponse`):**

```json
{
    "items": [
        {
            "id": "item_123",
            "name": "Advanced RAG Workflow",
            "description": "Short description...",
            "itemType": "project",
            "category": "ai-ml",
            "price": 100,
            "averageRating": 4.5,
            "reviewCount": 12,
            "authorId": "user_456",
            "authorName": "Alice",
            "previewImage": "https://...",
            "tags": ["rag", "llm"],
            "clientVersion": "1.0.0",
            "minClientVersion": "1.0.0",
            "createdAt": "2023-01-01T00:00:00Z",
            "updatedAt": "2023-01-02T00:00:00Z"
        }
    ],
    "total": 100,
    "hasMore": true
}
```

### 1.2 Get Item Details

Retrieve full details including markdown descriptions and file metadata.

- **Endpoint**: `GET /v1/marketplace/items/:id`
- **Auth**: Optional

**Response (`MarketplaceItemDetail`):**
_(Extends Item Listing)_

```json
{
    "id": "item_123",
    "...": "listing fields...",
    "longDescription": "# Markdown Content\nFull detail...",
    "previewImages": ["url1", "url2"],
    "readme": "# Setup Instructions...",
    "changelog": "- v1.0: Initial release",
    "metadata": {
        "size": 10240,
        "fileCount": 5,
        "dependencies": ["mcp-slack"]
    }
}
```

### 1.3 Purchase Item

Purchase an item using user credits.

- **Endpoint**: `POST /v1/marketplace/items/:id/purchase`
- **Auth**: Required

**Body:**

```json
{
    "idempotencyKey": "uuid-v4" // Optional but recommended
}
```

**Response (`PurchaseResponse`):**

```json
{
    "userWorkflowId": "purchased_inst_789",
    "creditsCharged": 100,
    "itemType": "project",
    "message": "Purchase successful"
}
```

**Errors:**

- `402 Payment Required`: Insufficient credits.
- `403 Forbidden`: User restricted.
- `404 Not Found`: Item does not exist.

---

## 2. Reviews

### 2.1 List Reviews

Get reviews for a specific item.

- **Endpoint**: `GET /v1/marketplace/items/:id/reviews`
- **Auth**: Optional

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `limit` | number | Default: 20 |
| `offset` | number | Default: 0 |

**Response (`ReviewsResponse`):**

```json
{
    "reviews": [
        {
            "id": "rev_1",
            "itemId": "item_123",
            "userId": "user_999",
            "userName": "Bob",
            "userPhotoUrl": "https://...",
            "rating": 5,
            "comment": "Great workflow!",
            "createdAt": "2023-01-05T00:00:00Z"
        }
    ],
    "averageRating": 4.5,
    "total": 1
}
```

### 2.2 Submit Review

Post a review for a purchased item.

- **Endpoint**: `POST /v1/marketplace/items/:id/reviews`
- **Auth**: Required

**Body (`ReviewSubmission`):**

```json
{
    "rating": 5, // 1-5
    "comment": "Optional text..."
}
```

**Errors:**

- `403 Forbidden`: User has not purchased the item.
- `409 Conflict`: User already reviewed this item.

---

## 3. Submissions (Publishing)

### 3.1 Submit Item

Submit a new Project or Operator to the marketplace for approval.

- **Endpoint**: `POST /v1/marketplace/submissions`
- **Auth**: Required

**Body (`MarketplaceSubmission`):**

```json
{
    "workflowId": "local_project_id_or_uuid",
    "itemType": "project",
    "category": "automation",
    "suggestedPrice": 50,
    "submissionNote": "Please review my awesome workflow.",
    "clientVersion": "0.1.0",
    "minClientVersion": "0.1.0"
}
```

**Response (`SubmissionResponse`):**

```json
{
    "id": "sub_555",
    "workflowId": "local_project_id_or_uuid",
    "itemType": "project",
    "status": "pending",
    "message": "Submission received"
}
```

**Errors:**

- `409 Conflict`: This item ID is already submitted.

---

## 4. Shared Data Types

### Enum: ItemType

- `project`
- `operator`
- `script-template`

### Enum: MarketplaceCategory

- `content-creation`
- `development`
- `productivity`
- `data-analysis`
- `business-ops`
- `education`
- `personal`
- `automated-agents`
- `other`
