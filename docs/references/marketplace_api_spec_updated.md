# Marketplace Client Implementation Guide

## Overview

The HighFlow Server marketplace supports two types of items:

1.  **Project Templates** - Complete project bundles (itemType: "project")
2.  **Operators** - Reusable workflow components (itemType: "operator")

Features:

- **Purchase**: Deduct credits and install items to user's workspace
- **Review**: Star rating (1-5) and text comments
- **Submit**: Users can submit their own projects and operators
- **Version Tracking**: Client version compatibility information

## API Endpoints

### 1. Browse & Search

**GET** `/v1/marketplace/items`

- **Query Params**:
  - `category`: Filter by category.
  - `search`: Search by name/description.
  - `itemType`: Filter by type ("project" or "operator").
  - `limit`, `offset`: Pagination.
- **Response**: List of items with `price`, `averageRating`, `reviewCount`, `clientVersion`, `minClientVersion`, and `itemType`.
  ```json
  {
    "items": [
      {
        "id": "mp_abc123",
        "name": "Data Processing Project",
        "itemType": "project",
        "category": "data-processing",
        "price": 50,
        "clientVersion": "1.2.3",
        "minClientVersion": "1.0.0",
        ...
      },
      {
        "id": "mp_xyz789",
        "name": "Excel Export Operator",
        "itemType": "operator",
        "category": "data-tools",
        "price": 10,
        "clientVersion": "1.2.3",
        "minClientVersion": "1.0.0",
        ...
      }
    ]
  }
  ```

### 2. Product Details

**GET** `/v1/marketplace/items/:id`

- Returns full details including `longDescription`, `previewImages`, `clientVersion`, `minClientVersion`, and `itemType`.

### 3. Purchase (Credit Usage)

**POST** `/v1/marketplace/items/:id/purchase`

- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  { "idempotencyKey": "optional-uuid" }
  ```
- **Response**:
  ```json
  {
    "userWorkflowId": "wf_...",
    "creditsCharged": 50,
    "itemType": "project",
    "message": "Purchased successfully"
  }
  ```
- **Error Handling**:
  - `402 Insufficient credits`: Prompt user to top up.
  - `200 OK` with `creditsCharged: 0`: Item was already purchased.

### 4. Reviews & Ratings

#### List Reviews

**GET** `/v1/marketplace/items/:id/reviews`

- **Query Params**: `limit`, `offset`.
- **Response**: Array of reviews with `averageRating` and `total`.

#### Post Review

**POST** `/v1/marketplace/items/:id/reviews`

- **Prerequisite**: User must have purchased the item.
- **Body**:
  ```json
  {
    "rating": 5, // Integer 1-5
    "comment": "Optional text"
  }
  ```
- **Errors**:
  - `403`: User hasn't purchased the item.
  - `409`: User already reviewed this item.

### 5. Submit to Marketplace

**POST** `/v1/marketplace/submissions`

- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "workflowId": "proj_user123",
    "itemType": "project",
    "category": "data-processing",
    "suggestedPrice": 50,
    "submissionNote": "Optional note for reviewers",
    "clientVersion": "1.2.3",
    "minClientVersion": "1.0.0"
  }
  ```
- **Field Requirements**:
  - `workflowId` (required): User's workflow/project ID to submit
  - `itemType` (required): "project" or "operator"
  - `category` (required): Category string
  - `suggestedPrice` (required): Price in credits (0 for free)
  - `clientVersion` (required): Client version (X.Y.Z format)
  - `minClientVersion` (optional): Minimum compatible version (defaults to clientVersion)
- **Response (201)**:
  ```json
  {
    "id": "sub_abc123",
    "workflowId": "proj_user123",
    "itemType": "project",
    "status": "pending"
  }
  ```
- **Errors**:
  - `400`: Invalid `itemType` or version format
  - `404`: Workflow not found or access denied
  - `409`: Workflow already submitted

## Client Implementation Checklist

- [ ] **Marketplace View**: Grid/List of items from `GET /v1/marketplace/items`.
- [ ] **Filter UI**:
  - Dropdown to filter by `itemType` (Project Template vs Operator).
  - Category filter.
- [ ] **Compatibility Check**: Display compatibility badge based on `minClientVersion` vs current client version.
- [ ] **Detail Modal/Page**: Show `longDescription`, `price`, `averageRating`, `itemType`, version compatibility info.
- [ ] **Purchase Button**:
  - Show "Purchase" if not bought.
  - Show "Install/Open" if already owned.
  - Show compatibility warning if current version < `minClientVersion`.
  - Show item type icon (📦 for projects, ⚙️ for operators).
  - **Action**: Call `POST .../purchase`. Handle 402 error (show "Not enough credits" modal).
- [ ] **Reviews Section**:
  - Display average rating stars.
  - List reviews using `GET .../reviews`.
  - "Write a Review" button (visible only if purchased).
  - Form with Star Rating (1-5) and Text Area.
- [ ] **Submit to Marketplace**:
  - Button to submit user's own projects/operators.
  - Form with:
    - Item type selector (Project / Operator)
    - Category dropdown
    - Price input
    - Submission note
  - Auto-include current client version (`app.getVersion()`).
  - Optional field for minimum compatible version.
  - Submit via `POST /v1/marketplace/submissions`.

## Version Compatibility Helper

```javascript
function isCompatible(currentVersion, minVersion) {
  if (!minVersion) return true; // No version requirement

  const [maj1, min1, patch1] = currentVersion.split(".").map(Number);
  const [maj2, min2, patch2] = minVersion.split(".").map(Number);

  if (maj1 !== maj2) return maj1 > maj2;
  if (min1 !== min2) return min1 > min2;
  return patch1 >= patch2;
}

// Usage in Electron client
const { app } = require("electron");
const currentVersion = app.getVersion(); // "1.1.5"

// Check marketplace item compatibility
const item = { minClientVersion: "1.0.0", itemType: "project" };
if (!isCompatible(currentVersion, item.minClientVersion)) {
  // Show warning: "This project requires version 1.0.0 or higher"
}

// When submitting to marketplace
const submissionData = {
  workflowId: selectedWorkflow.id,
  itemType: "operator", // or 'project'
  category: "data-tools",
  suggestedPrice: 10,
  clientVersion: currentVersion,
  minClientVersion: "1.0.0",
};
```

## Item Type Icons & Badges

- **Project Template**: 📦 (Blue badge)
- **Operator**: ⚙️ (Green badge)

Use consistent visual indicators throughout the UI to help users quickly identify item types.
