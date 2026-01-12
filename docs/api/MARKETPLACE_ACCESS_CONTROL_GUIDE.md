# Marketplace Access Control Integration Guide

This guide details how to implement access control for marketplace items, allowing authors to restrict visibility and installation to specific users (by email) or organizations (by email domain).

## Overview

- **Public**: Visible to everyone.
- **Restricted**: Visible only to:
  - The Author.
  - Users with whitelisted Emails.
  - Users with whitelisted Email Domains.
  - Users who have already purchased the item.

## 1. Item Registration (Submission) via `RegistrationWizard`

When submitting a new item, include the `accessControl` object in the payload. Note that if you are using `multipart/form-data` (for image uploads), you must serialize this object as a JSON string if your HTTP client doesn't handle deep object serialization automatically in FormData.

### Payload Structure

```json
{
  // ... other fields (name, definition, etc.)
  "accessControl": {
    "type": "public", // or "restricted"
    "allowedEmails": ["alice@partner.com", "bob@client.com"],
    "allowedDomains": ["company.com", "university.edu"]
  }
}
```

### TypeScript Interface

```typescript
interface AccessControl {
  type: "public" | "restricted";
  allowedEmails: string[];
  allowedDomains: string[];
}
```

## 2. Update Item Metadata & Access (`PUT /v1/marketplace/items/:id`)

**NEW ENDPOINT**: Authors can now update `name`, `description`, `tags`, `icon`, `readme`, and **`accessControl`** of live items without creating a new version submission.

- **URL**: `PUT /v1/marketplace/items/:itemId`
- **Method**: `PUT`
- **Headers**: `Authorization: Bearer <token>`
- **Body** (JSON):

```json
{
  "name": "Updated Name", // Optional
  "accessControl": {
    "type": "restricted",
    "allowedEmails": ["newuser@test.com"],
    "allowedDomains": []
  }
}
```

## 3. Browsing & Visibility

- The backend `GET /v1/marketplace/items` automatically filters results based on the logged-in user's email.
- **Frontend Action**: No special query param needed. Just ensure the user is authenticated to see restricted items they have access to. Unauthenticated users only see Public items.

## 4. Item Details

- `GET /v1/marketplace/items/:id` will return `403 Forbidden` (or 404 for security) if the user tries to view a restricted item they don't have permission for.
- **Permissions**:
  - Author: Always Full Access.
  - Admin: Always Full Access.
  - Purchaser: Always Read Access (can reinstall).
  - Whitelisted User/Domain: Read/Purchase Access.
