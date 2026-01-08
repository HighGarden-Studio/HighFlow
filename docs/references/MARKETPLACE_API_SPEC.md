# Marketplace API Specification (Latest Updates)

This document outlines the API specifications for Marketplace Submissions (including Image Uploads) and the Library response structure.

## 1. Create Submission (Upload Images)

Submit a new item to the marketplace. Supports **Request Multipart/Form-Data** for image uploads.

- **Endpoint**: `POST /v1/marketplace/submissions`
- **Content-Type**: `multipart/form-data`
- **Auth**: Required (`Bearer <token>`)

### Request Body (FormData)

| Field            | Type          | Required | Description                                                                 |
| :--------------- | :------------ | :------- | :-------------------------------------------------------------------------- |
| `previewImages`  | `File`        | No       | Multiple files allowed (Max 5, ~5MB each). **Key must be `previewImages`**. |
| `itemId`         | `String`      | Yes      | Local Project/Workflow ID.                                                  |
| `name`           | `String`      | Yes      | Item Name.                                                                  |
| `description`    | `String`      | No       | Short description.                                                          |
| `definition`     | `JSON String` | Yes      | **Stringified** JSON of the project definition.                             |
| `itemType`       | `String`      | Yes      | `project`, `operator`, or `script_template`.                                |
| `category`       | `String`      | Yes      | e.g. `productivity`, `utilities`.                                           |
| `suggestedPrice` | `Number`      | No       | Price in credits (default 0).                                               |
| `clientVersion`  | `String`      | Yes      | Semver (e.g. `1.0.0`).                                                      |
| `icon`           | `String`      | No       | Emoji or URL.                                                               |
| `tags`           | `JSON String` | No       | **Stringified** array of strings.                                           |
| `previewGraph`   | `JSON String` | No       | **Stringified** JSON object `{ nodes: [], edges: [] }`.                     |

### Response (201 Created)

```json
{
  "id": "sub_xyz...",
  "itemId": "wf_abc...",
  "itemType": "project",
  "status": "pending",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

## 2. Get Item Details / List Items

Responses for `GET /v1/marketplace/items` and `GET /v1/marketplace/items/:id` now include image fields.

### Response Structure

```json
{
  "id": "item_xyz...",
  "name": "Project Name",
  "description": "...",
  "price": 0,
  "currency": "credit",
  "author": {
    "name": "use***",
    "isVerified": false,
    "avatarUrl": null
  },
  "icon": "🧙",              // Emoji or URL
  "iconUrl": null,           // Legacy field (nullable)
  "previewImages": [         // Array of Image URLs
    "https://storage.googleapis.com/.../img1.png",
    "https://storage.googleapis.com/.../img2.png"
  ],
  "stats": { ... },
  "version": "1.0.0"
}
```

---

## 3. My Library (Purchases & Submissions)

The Library endpoint returns both purchased items and user's own submissions.

- **Endpoint**: `GET /v1/marketplace/library`
- **Auth**: Required

### Response Structure

```json
{
  "items": [
    {
      "associationType": "purchased", // or "published"
      "id": "item_xyz",
      "localId": "wf_abc",
      "name": "My Item",
      "summary": "...",
      "price": 10, // Added
      "currency": "credit", // Added
      "icon": "🚀", // Added
      "previewImages": [
        // Added
        "https://storage.googleapis.com/.../screenshot.png"
      ],
      "author": {
        "id": "user_123",
        "name": "Author Name"
      },
      "purchasedAt": "..." // If purchased
    }
  ]
}
```
