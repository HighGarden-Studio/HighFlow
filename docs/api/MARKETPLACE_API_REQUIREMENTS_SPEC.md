# Marketplace API Response Update (AI Requirements)

New field `requirements` has been added to Marketplace Item responses. This field lists the specific AI Provider and Model requirements derived from the item's definition.

## 1. Updated Response Structure

The `requirements` array is now included in the following endpoints:

- `GET /v1/marketplace/items`
- `GET /v1/marketplace/items/:id`
- `GET /v1/marketplace/library` (for both `purchased` and `published` items)

### JSON Type Definition

```typescript
interface AIRequirement {
  provider: string; // e.g. "google", "openai"
  model: string; // e.g. "gemini-pro", "gpt-4"
}

interface MarketplaceItem {
  // ... existing fields
  requirements: AIRequirement[];
}
```

### Example Response

```json
{
  "id": "mp_12345",
  "name": "Advanced Writing Assistant",
  "requirements": [
    {
      "provider": "google",
      "model": "gemini-pro"
    },
    {
      "provider": "anthropic",
      "model": "claude-3-opus"
    }
  ]
  // ... other fields
}
```

## 2. Requirements Extraction Logic

When a **Project** or **Operator** is submitted, the backend automatically extracts unique `(provider, model)` pairs from:

- **Project Level**: `project.aiProvider`, `project.aiModel`
- **Operators List**: `operators[].aiProvider`, `operators[].aiModel`
- **Tasks List**: `tasks[].aiProvider`, `tasks[].aiModel`, and `tasks[].reviewAiProvider`, `tasks[].reviewAiModel`
- **Operator Definition**: `definition.aiProvider`, `definition.aiModel` (if itemType is operator)

Duplicate requirements are automatically removed.
