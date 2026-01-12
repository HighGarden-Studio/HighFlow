# Marketplace API Spec: Import Item

This document details the new API endpoint for retrieving the full import content of a purchased marketplace item.

## 1. Import Item (Get Content)

Retrieves the **secured content** (e.g., project source, scripts, operators) for a marketplace item so it can be imported into the user's workspace.
This endpoint returns data ONLY if the user is the **Author** or has **Purchased** the item.

- **Endpoint**: `GET /v1/marketplace/items/:id/import`
- **Auth**: Required (`Bearer <token>`)
- **Permissions**: Purchase record verified (or Author).

### Responses

#### Success (200 OK)

Returns the item metadata plus the specific definition/content field based on `type`.

**Common Fields:**

```json
{
  "id": "mp_123456",
  "type": "project" | "operator" | "script_template",
  "name": "My Project",
  "version": "1.0.0",
  "description": "Short summary",
  "requirements": [...]
}
```

**Type-Specific Fields:**

1.  **Project** (`type: "project"`)

    ```json
    {
      ...common,
      "projectDefinition": { ... } // Full Node-RED flow/project JSON
    }
    ```

2.  **Operator** (`type: "operator"`)

    ```json
    {
      ...common,
      "operatorDefinition": { ... } // Operator definition JSON
    }
    ```

3.  **Script Template** (`type: "script_template"`)
    ```json
    {
      ...common,
      "scriptContent": "console.log('Hello');" // Raw script string
    }
    ```

#### Error: Not Found (404)

```json
{
  "error": "not_found",
  "message": "Marketplace item not found"
}
```

#### Error: Forbidden (403)

If the user has not purchased the item.

```json
{
  "error": "forbidden",
  "message": "Access denied: You must purchase this item to install it."
}
```
