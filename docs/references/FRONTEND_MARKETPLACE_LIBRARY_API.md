# Marketplace Library API Update (Frontend Handover)

This document details the update to the `GET /v1/marketplace/library` API.

**Goal**: Provide a unified view of items the user has interact with, including items they **purchased** and items they **submitted/published**.

## GET /v1/marketplace/library

Returns a mixed list of bought items and published items.

### Response Structure

The `items` array now contains objects with an `associationType` field to distinguish between purchased and published items.

```json
{
  "items": [
    // 1. Purchased Item Example
    {
      "associationType": "purchased", // KEY FIELD
      "id": "mp_abc123", // Marketplace Item ID
      "localId": "wf_user_local_1", // Local Project ID (The copy the user owns)
      "type": "project",
      "name": "Super Workflow",
      "summary": "Boost productivity",
      "iconUrl": "https://...",
      "author": { "id": "usr_auth", "name": "Author Name" },
      "version": "1.0.0",
      "stats": { "rating": 4.5 },
      "purchasedAt": "2026-01-07T00:00:00Z"
    },
    // 2. Published/Submitted Item Example
    {
      "associationType": "published", // KEY FIELD
      "id": "mp_xyz789", // Marketplace Item ID (null if pending/rejected)
      "localId": "wf_local_src", // Source Item ID (The one submitted)
      "submissionId": "sub_def456", // Submission ID
      "type": "operator",
      "name": "My Custom Operator",
      "summary": "Does cool stuff",
      "iconUrl": null,
      "author": { "id": "me", "name": "Me" },
      "version": "1.0.1",
      "status": "pending", // 'pending' | 'approved' | 'rejected'
      "publishedAt": "2026-01-08T00:00:00Z"
    }
  ]
}
```

### Key Changes for Frontend

1.  **Iterate mixed list**: The library view should handle both types.
2.  **`associationType`**: Use this to determine if the item is "Bought" or "My Creation".
3.  **`localId`**: Use this ID to "Open" the project/operator in the editor.
    - For `purchased`: It's the ID of the local copy created at purchase.
    - For `published`: It's the ID of the source item the user submitted.
4.  **`status`**: For `published` items, display the review status (pending/approved/rejected).
