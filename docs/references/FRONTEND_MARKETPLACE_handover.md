# Marketplace Frontend Updates

This document summarizes the changes required for the frontend integration of the Marketplace, specifically focusing on the new **Image Upload** and **Item Submission** flow.

## 1. Submission Endpoint Update

The submission endpoint now requires `multipart/form-data` to handle image uploads and complex data structures simultaneously.

**Endpoint:** `POST /v1/marketplace/submissions`  
**Content-Type:** `multipart/form-data`

### Form Data Fields

| Field            | Type              | Required | Description                                                            |
| :--------------- | :---------------- | :------- | :--------------------------------------------------------------------- |
| `workflowId`     | String            | Yes      | ID of the project/operator being submitted.                            |
| `itemType`       | String            | Yes      | `project`, `operator`, or `script_template`.                           |
| `category`       | String            | Yes      | The selected category slug.                                            |
| `suggestedPrice` | Number            | Yes      | Price in credits (integer >= 0).                                       |
| `clientVersion`  | String            | Yes      | Semantic version string (e.g., "1.0.0").                               |
| `submissionNote` | String            | No       | Optional note for the reviewer.                                        |
| `tags`           | **String (JSON)** | No       | **JSON serialized array** of strings (e.g., `["tag1", "automation"]`). |
| `previewGraph`   | **String (JSON)** | No       | **JSON serialized object** representing the flow graph.                |
| `previewImages`  | File              | No       | One or more image files (max 5, PNG/JPG/WEBP).                         |

---

## 2. Integration Example (JavaScript/Axios)

When submitting data from the frontend, use the `FormData` API to construct the payload. Note that `tags` and `previewGraph` must be JSON-stringified before appending.

```javascript
/*
 * Helper function to submit marketplace item
 */
async function submitToMarketplace(data, imageFiles) {
  const formData = new FormData();

  // 1. Append simple fields
  formData.append("workflowId", data.workflowId);
  formData.append("itemType", data.itemType); // 'project', 'operator', etc
  formData.append("category", data.category);
  formData.append("suggestedPrice", data.suggestedPrice);
  formData.append("clientVersion", data.clientVersion);

  if (data.submissionNote) {
    formData.append("submissionNote", data.submissionNote);
  }

  // 2. Append JSON fields (Must be stringified)
  if (data.tags && data.tags.length > 0) {
    formData.append("tags", JSON.stringify(data.tags));
  }

  if (data.previewGraph) {
    formData.append("previewGraph", JSON.stringify(data.previewGraph));
  }

  // 3. Append File objects
  // 'imageFiles' is an array of browser File objects (e.g. from <input type="file">)
  if (imageFiles && imageFiles.length > 0) {
    imageFiles.forEach((file) => {
      formData.append("previewImages", file);
    });
  }

  // 4. Send Request
  // Note: Axios (and fetch) automatically sets the Content-Type header with boundary
  // when passing a FormData object. Manual header setting is usually not required
  // but shown here for clarity.
  const response = await axios.post("/v1/marketplace/submissions", formData, {
    headers: {
      Authorization: `Bearer ${userSessionToken}`,
      // 'Content-Type': 'multipart/form-data' // let the browser set formatting
    },
  });

  return response.data;
}
```

## 3. Storage & Display

- **Public URLs**: The backend uploads these images to Google Cloud Storage (or a mock storage in dev) and returns public URLs.
- **Response**: The `MarketplaceItem` object will contain a `previewImages` array of strings (URLs).
- **Display**: Simply use `<img src={item.previewImages[0]} />` to display these images in the marketplace listing.
