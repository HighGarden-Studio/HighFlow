# Marketplace API Update for Frontend

**Date:** 2026-01-07
**Topic:** Terminology Update for Marketplace Endpoints

> [!IMPORTANT]
> A recent refactor standardized "Workflow" to "Project" across the application. However, for **Marketplace** interactions, we have adopted `itemId` as the standard identifier to account for diverse item types (Projects, Operators, Templates).

## Summary of Changes

### 1. Item Submission (`POST /submissions`)

When submitting an item (from your local workspace) to the marketplace:

- **Endpoint:** `POST /v1/marketplace/submissions`
- **Request Body (FormData):**
  - **CHANGED**: `workflowId` → `itemId`
  - **Note**: This `itemId` refers to the ID of the local Project/Workflow you are submitting.

```javascript
// Example
const formData = new FormData();
formData.append("itemId", "wf_local_123"); // Previously workflowId/projectId
formData.append("itemType", "project");
// ... other fields unchanged
```

### 2. Item Purchase (`POST /purchase`)

When purchasing an item:

- **Endpoint:** `POST /v1/marketplace/items/:id/purchase` (No change in URL)
- **Response Body:**
  - **CHANGED**: Returned key for the new local copy is now `itemId` (was `workflowId` or `projectId`).
  - **Note**: This `itemId` refers to the new ID of the item in your local library.

```json
// Response
{
  "itemId": "wf_new_copy_456", // Previously projectId
  "creditsCharged": 100,
  "itemType": "project",
  "message": "Purchase successful"
}
```

### 3. General Browsing

- **No Change**: `GET /v1/marketplace/items` and `GET /v1/marketplace/items/:id` still use `id` for the marketplace listing ID.

---

## Action Required

Please search for all instances of `workflowId` (and any recent `projectId` updates) in your Marketplace Service/Components and ensure they match the above specification:

1.  **Submission Form**: Send `itemId` instead of `workflowId`.
2.  **Purchase Logic**: Expect `itemId` in the success response to redirect the user (e.g., to `/projects/:itemId`).
