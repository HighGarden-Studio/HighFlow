/**
 * Marketplace Type Definitions
 */

/**
 * Item type in marketplace
 */
export type ItemType = 'project' | 'operator' | 'script-template';

/**
 * Marketplace categories
 */
export type MarketplaceCategory =
    | 'content-creation'
    | 'development'
    | 'productivity'
    | 'data-analysis'
    | 'business-ops'
    | 'education'
    | 'personal'
    | 'automated-agents'
    | 'other';

/**
 * Marketplace item listing (browse/search result)
 */
export interface MarketplaceItem {
    id: string;
    name: string;
    description: string;
    itemType: ItemType;
    category: MarketplaceCategory;
    price: number; // Credits
    averageRating: number; // 0-5
    reviewCount: number;
    downloadCount?: number;
    authorId: string;
    authorName?: string;
    author?: {
        id: string;
        name: string;
        isVerified?: boolean;
    };
    previewImage?: string;
    previewImages?: string[]; // Array of image URLs
    iconUrl?: string; // Icon for cards
    tags?: string[];
    clientVersion: string; // Version this item was created with
    minClientVersion: string; // Minimum client version required
    createdAt: string;
    updatedAt: string;
    status?: 'pending' | 'approved' | 'rejected'; // For authored items
    localId?: string; // For library items (to open locally)
    requirements?: {
        provider: string;
        model: string;
    }[];
}

/**
 * Full marketplace item details
 */
export interface MarketplaceItemDetail extends MarketplaceItem {
    longDescription: string; // Markdown formatted
    previewImages: string[]; // Array of image URLs
    readme?: string; // Markdown formatted
    changelog?: string;
    metadata?: {
        size?: number;
        fileCount?: number;
        dependencies?: string[];
        [key: string]: any;
    };
}

/**
 * Marketplace review
 */
export interface MarketplaceReview {
    id: string;
    itemId: string;
    userId: string;
    userName?: string;
    userPhotoUrl?: string;
    rating: number; // 1-5
    comment?: string;
    createdAt: string;
    updatedAt?: string;
}

/**
 * Review list response
 */
export interface ReviewsResponse {
    reviews: MarketplaceReview[];
    averageRating: number;
    total: number;
}

/**
 * Item list response
 */
export interface MarketplaceItemsResponse {
    items: MarketplaceItem[];
    total?: number;
    hasMore?: boolean;
}

/**
 * Purchase response
 */
export interface PurchaseResponse {
    itemId: string; // New local ID (formerly userWorkflowId)
    creditsCharged: number;
    itemType: ItemType;
    message: string;
}

/**
 * Marketplace submission request
 */
export interface MarketplaceSubmission {
    itemId: string; // ID of the local item (formerly workflowId)
    name: string;
    description: string;
    itemType: ItemType;
    category: MarketplaceCategory;
    suggestedPrice: number;
    submissionNote?: string;
    clientVersion: string;
    minClientVersion?: string;
    tags?: string[];
    definition?: string; // JSON string of the item content
    previewGraph?: any;
    previewImages?: File[];
    icon?: File | null; // Main icon file
}

/**
 * Submission response
 */
export interface SubmissionResponse {
    id: string;
    workflowId: string;
    itemType: ItemType;
    status: 'pending' | 'approved' | 'rejected';
    message?: string;
}

/**
 * Browse/search filters
 */
export interface MarketplaceFilters {
    category?: MarketplaceCategory;
    search?: string;
    itemType?: ItemType;
    limit?: number;
    offset?: number;
    sortBy?: 'popular' | 'recent' | 'rating' | 'price';
}

/**
 * Review submission request
 */
export interface ReviewSubmission {
    rating: number; // 1-5
    comment?: string;
}

/**
 * Library item association type
 */
export type AssociationType = 'purchased' | 'published';

/**
 * Item in user's library
 */
export interface LibraryItem {
    associationType: AssociationType; // KEY FIELD
    id: string | null; // Marketplace Item ID (null if pending/rejected)
    localId: string; // ID of the local project/operator
    submissionId?: string; // For published items
    type: ItemType; // 'project' | 'operator' | 'script-template'
    name: string;
    summary?: string;
    description?: string;
    iconUrl?: string | null;
    author: {
        id: string;
        name: string;
    };
    version: string;
    stats?: {
        rating: number;
    };
    purchasedAt?: string; // ISO Date
    publishedAt?: string; // ISO Date
    status?: 'pending' | 'approved' | 'rejected'; // For published items
    previewImages?: string[]; // Added in spec
}

/**
 * Library response
 */
export interface LibraryResponse {
    items: LibraryItem[];
    total?: number; // Optional in spec, but good to have
}
