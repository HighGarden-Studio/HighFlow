/**
 * AI Service Utilities
 *
 * Helper functions for AI services
 */

import type { TaskComplexity } from '@core/types/ai';
import type { Task } from '@core/types/database';

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  // More accurate for English text, less so for code
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  tokensUsed: { prompt: number; completion: number },
  costPerMillion: { input: number; output: number }
): number {
  const inputCost = (tokensUsed.prompt / 1000000) * costPerMillion.input;
  const outputCost = (tokensUsed.completion / 1000000) * costPerMillion.output;
  return inputCost + outputCost;
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(2)}m`; // Show in mills
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  return `${(tokens / 1000).toFixed(1)}K tokens`;
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  const targetLength = Math.floor((maxTokens * 4) * 0.9); // 90% safety margin
  return text.substring(0, targetLength) + '...';
}

/**
 * Extract JSON from text that may contain markdown
 */
export function extractJSON(text: string): any {
  // Try to parse directly first
  try {
    return JSON.parse(text);
  } catch {
    // Look for JSON in code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        // Continue to next attempt
      }
    }

    // Look for JSON object anywhere in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Continue to next attempt
      }
    }

    throw new Error('No valid JSON found in text');
  }
}

/**
 * Chunk large text into smaller pieces
 */
export function chunkText(text: string, maxTokensPerChunk: number, overlap: number = 100): string[] {
  const maxCharsPerChunk = maxTokensPerChunk * 4;
  const overlapChars = overlap * 4;

  if (text.length <= maxCharsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxCharsPerChunk, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlapChars;
  }

  return chunks;
}

/**
 * Build context string from previous interactions
 */
export function buildContextString(
  interactions: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number
): string {
  let context = '';
  let tokenCount = 0;

  // Add interactions in reverse order (most recent first)
  for (let i = interactions.length - 1; i >= 0; i--) {
    const interaction = interactions[i];
    if (!interaction) continue;
    const interactionText = `${interaction.role}: ${interaction.content}\n\n`;
    const tokens = estimateTokens(interactionText);

    if (tokenCount + tokens > maxTokens) {
      break;
    }

    context = interactionText + context;
    tokenCount += tokens;
  }

  return context;
}

/**
 * Assess task complexity
 */
export function assessTaskComplexity(task: Task): TaskComplexity {
  let complexityScore = 0;

  // Check estimated time
  if (task.estimatedMinutes) {
    if (task.estimatedMinutes > 240) complexityScore += 3;
    else if (task.estimatedMinutes > 60) complexityScore += 2;
    else complexityScore += 1;
  }

  // Check description length
  const descLength = (task.description || '').length;
  if (descLength > 500) complexityScore += 2;
  else if (descLength > 200) complexityScore += 1;

  // Check if has subtasks
  if (task.parentTaskId) complexityScore += 1;

  // Check priority
  if (task.priority === 'urgent') complexityScore += 1;

  // Check tags
  const complexTags = ['architecture', 'integration', 'migration', 'refactoring'];
  const hasComplexTag = task.tags?.some((tag) => complexTags.includes(tag.toLowerCase()));
  if (hasComplexTag) complexityScore += 2;

  // Determine complexity
  if (complexityScore >= 6) return 'complex';
  if (complexityScore >= 3) return 'medium';
  return 'simple';
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sanitize input for AI prompts
 */
export function sanitizeInput(input: string): string {
  // Remove potentially harmful content
  return input
    .replace(/\[SYSTEM\]/gi, '[USER_SYSTEM]')
    .replace(/\[ASSISTANT\]/gi, '[USER_ASSISTANT]')
    .trim();
}

/**
 * Merge prompt templates with variables
 */
export function mergeTemplate(template: string, variables: Record<string, any>): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, String(value));
  }

  return result;
}

/**
 * Rate limit tracker
 */
export class RateLimitTracker {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if request is allowed
   */
  isAllowed(provider: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(provider) || [];

    // Remove old requests outside window
    const recentRequests = requests.filter((time) => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(provider, recentRequests);

    return true;
  }

  /**
   * Get time until next request is allowed
   */
  getRetryAfter(provider: string, maxRequests: number, windowMs: number): number {
    const requests = this.requests.get(provider) || [];
    if (requests.length < maxRequests) {
      return 0;
    }

    const oldestRequest = requests[0];
    if (!oldestRequest) return 0;
    const timeUntilExpiry = windowMs - (Date.now() - oldestRequest);

    return Math.max(0, timeUntilExpiry);
  }
}

/**
 * Token bucket for rate limiting
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   */
  tryConsume(amount: number): boolean {
    this.refill();

    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true;
    }

    return false;
  }

  /**
   * Get available tokens
   */
  getAvailable(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Parse markdown code blocks
 */
export function parseCodeBlocks(text: string): Array<{ language: string; code: string }> {
  const blocks: Array<{ language: string; code: string }> = [];
  const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2]?.trim() || '',
    });
  }

  return blocks;
}

/**
 * Validate AI response structure
 */
export function validateAIResponse(response: any, requiredFields: string[]): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return requiredFields.every((field) => field in response);
}
