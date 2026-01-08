# Marketplace Library API Specification

**Date:** 2026-01-07
**Version:** 1.0.0
**Status:** Draft

## Overview

This document specifies the API endpoint for retrieving the authenticated user's "My Library" in the Marketplace. This library includes:

1.  **Purchased Items**: Items the user has acquired (free or paid) from the marketplace.
2.  **Registered Items**: Items the user has submitted/authored and published to the marketplace.

## Endpoints

### Get My Library

Retrieves a unified list of items owned or authored by the user.

- **URL**: `/v1/marketplace/library`
- **Method**: `GET`
- **Auth**: Required (Bearer Token)

#### Request Parameters

| Parameter   | Type     | Required | Description                                                    |
| :---------- | :------- | :------- | :------------------------------------------------------------- |
| `type`      | `string` | No       | Filter by item type (`project`, `operator`, `script-template`) |
| `ownership` | `string` | No       | Filter by ownership (`purchased`, `registered`)                |

#### Response Body

```json
{
    "items": [
        {
            "id": "item_12345",
            "name": "Advanced RAG Workflow",
            "itemType": "project",
            "version": "1.2.0",
            "description": "Short description...",
            "authorName": "Another User",
            "iconUrl": "...",
            "updatedAt": "2026-01-05T12:00:00Z",
            "ownership": "purchased",
            "purchaseDate": "2026-01-06T09:30:00Z"
        },
        {
            "id": "item_67890",
            "name": "My Custom Operator",
            "itemType": "operator",
            "version": "1.0.1",
            "description": "My tool description...",
            "authorName": "Me (You)",
            "iconUrl": "...",
            "updatedAt": "2026-01-07T10:00:00Z",
            "ownership": "registered",
            "status": "published" // Only for registered items
        }
    ],
    "total": 2
}
```

### Data Models

#### `LibraryItem`

| Field          | Type      | Description                                                    |
| :------------- | :-------- | :------------------------------------------------------------- |
| `id`           | `string`  | The Marketplace Item ID (Listing ID)                           |
| `name`         | `string`  | Display name of the item                                       |
| `itemType`     | `string`  | `project` \| `operator` \| `script-template`                   |
| `version`      | `string`  | Current version of the item                                    |
| `description`  | `string`  | Short summary                                                  |
| `authorName`   | `string`  | Name of the author                                             |
| `iconUrl`      | `string?` | URL or Emoji for the icon                                      |
| `updatedAt`    | `string`  | Last update ISO timestamp                                      |
| `ownership`    | `string`  | `purchased` \| `registered`                                    |
| `purchaseDate` | `string?` | ISO timestamp (Purchased items only)                           |
| `status`       | `string?` | `pending` \| `published` \| `rejected` (Registered items only) |

## Implementation Notes

- **Frontend**: The `MarketplaceLibraryView` should use this endpoint to populate the "Purchased" and "My Uploads" tabs by filtering the `ownership` field or using the query parameter.
- **Backend**: Should join `Purchases` table and `Items` table (where authorId = currentUserId).
