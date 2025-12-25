# Client API Guide: AI Generation Requests

The backend returns `400 Bad Request` with `Please use a valid role: user, model` because the request payload format is incorrect for the Vertex AI Gemini API.

The client is likely formatting requests using OpenAI-style conventions (e.g., `role: 'assistant'`) or including the `system` role within the `contents` array.

## Correct Request Format

### 1. `role` Field

- **Allowed Values**: `'user'`, `'model'`
- **Restrictions**:
  - Do **NOT** use `'assistant'`. Use `'model'` instead.
  - Do **NOT** use `'system'` inside the `contents` array. System instructions must be sent in the top-level `systemInstruction` field.

### 2. `contents` Structure

The `contents` field must be an **array of turn objects**.

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Hello, how are you?" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "I am doing well, thank you." }]
    },
    {
      "role": "user",
      "parts": [
        { "text": "Please analyze this image." },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "base64_encoded_image_string..."
          }
        }
      ]
    }
  ],
  "systemInstruction": "You are a helpful assistant." // Optional system prompt
}
```

### 3. Image Handling

- Images must be included in the `parts` array of a `user` message.
- Use `inlineData` for Base64 images.
- Do not send images as a separate "image" role.

### Common Mistakes

- ❌ `role: "assistant"` -> ✅ Use `role: "model"`
- ❌ `role: "system"` in contents -> ✅ Use `systemInstruction` top-level field
- ❌ Sending `{ "role": "user", "content": "..." }` (OpenAI style) -> ✅ Use `{ "role": "user", "parts": [{ "text": "..." }] }`

## Example (Correct Payload)

```json
POST /v1/ai/generate
Content-Type: application/json

{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Describe this image for me." },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.5,
    "maxOutputTokens": 1024
  }
}
```
