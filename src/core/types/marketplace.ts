/**
 * Marketplace Type Definitions
 */

/**
 * Item type in marketplace
 */
export type ItemType = 'project' | 'operator';

/**
 * Marketplace categories
 */
export type MarketplaceCategory =
    | 'data-processing'
    | 'data-tools'
    | 'automation'
    | 'ai-ml'
    | 'web-scraping'
    | 'api-integration'
    | 'utilities'
    | 'templates'
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
    previewImage?: string;
    tags?: string[];
    clientVersion: string; // Version this item was created with
    minClientVersion: string; // Minimum client version required
    createdAt: string;
    updatedAt: string;
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
    userWorkflowId: string;
    creditsCharged: number;
    itemType: ItemType;
    message: string;
}

/**
 * Marketplace submission request
 */
export interface MarketplaceSubmission {
    workflowId: string;
    itemType: ItemType;
    category: MarketplaceCategory;
    suggestedPrice: number;
    submissionNote?: string;
    clientVersion: string;
    minClientVersion?: string;
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
