import type { AIConfig, AIMessage } from '@core/types/ai';
import type OpenAI from 'openai';

/**
 * OpenAI Model Adapter Interface
 *
 * Defines how to adapt request parameters and messages for specific OpenAI model families.
 */
export interface OpenAIModelAdapter {
    /**
     * Adapt the chat completion request payload.
     * Use this to modify parameter names (e.g., max_tokens vs max_completion_tokens)
     * or defaults based on the model.
     */
    adaptRequest(
        config: AIConfig,
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
    ): OpenAI.Chat.ChatCompletionCreateParams;

    /**
     * Adapt the messages structure.
     * Use this to handle role differences (e.g., 'system' vs 'developer')
     * or content formatting specific to models (e.g. o1 limitations).
     */
    adaptMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[];
}

/**
 * Default Adapter (GPT-4, GPT-3.5, etc.)
 * Uses standard 'system' role and 'max_tokens'.
 */
export class DefaultOpenAIAdapter implements OpenAIModelAdapter {
    adaptRequest(
        config: AIConfig,
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
    ): OpenAI.Chat.ChatCompletionCreateParams {
        return {
            model: config.model,
            messages,
            tools: this.mapTools(config.tools),
            tool_choice: config.toolChoice === 'none' ? undefined : config.toolChoice,
            max_tokens: config.maxTokens || 4096,
            temperature: config.temperature,
            top_p: config.topP,
            frequency_penalty: config.frequencyPenalty,
            presence_penalty: config.presencePenalty,
            stop: config.stopSequences,
            response_format: config.responseFormat === 'json' ? { type: 'json_object' } : undefined,
        } as OpenAI.Chat.ChatCompletionCreateParams;
    }

    adaptMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
        // Standard mapping mechanism, reused from original logic conceptually
        // For default, we just returning "as-is" logic normally handled by the Provider
        // But for separation of concerns, the Provider will delegate the *structure* creation to here.
        // NOTE: The actual heavy lifting of multi-modal conversion is shared util or kept in provider for now?
        // Let's assume the Provider still does the multi-modal/tool conversion first, or we move it here?
        // To keep refactoring minimal, let's assume Provider passes "already formatted for OpenAI standard" messages,
        // and this adapter just tweaks roles if needed.
        // BUT 'developer' role requires changing 'system' to 'developer'.

        return messages.map((m) => {
            // Basic pass-through for standard models, assuming input is already somewhat standard
            // However, strictly speaking, the provider currently does `buildChatMessages`.
            // We should probably move `buildChatMessages` logic completely here or call it from here.
            // For this step, let's keep it simple: The provider builds standard OpenAI messages,
            // and the adapter transforms them if necessary (e.g. renaming roles).

            // Standard models use 'system' role.
            return m as unknown as OpenAI.Chat.ChatCompletionMessageParam;
        });
    }

    protected mapTools(tools?: AIConfig['tools']) {
        if (!tools || tools.length === 0) return undefined;
        return tools.map((tool) => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }
}

/**
 * Adapter for O1 and O3-mini models
 * - Uses 'max_completion_tokens' instead of 'max_tokens'
 * - Uses 'developer' role instead of 'system' (though 'system' is temporarily supported, 'developer' is preferred for newer models)
 * - Often does not support 'temperature' (fixed at 1), 'streaming' (in some beta versions, though mostly supported now), etc.
 * - We will enforce max_completion_tokens and developer role.
 */
export class O1Adapter extends DefaultOpenAIAdapter {
    adaptRequest(
        config: AIConfig,
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
    ): OpenAI.Chat.ChatCompletionCreateParams {
        const payload = super.adaptRequest(config, messages);

        // Convert max_tokens -> max_completion_tokens
        if (payload.max_tokens) {
            (payload as any).max_completion_tokens = payload.max_tokens;
            delete payload.max_tokens;
        }

        // Remove unsupported params for o1 (as of current specs, temperature is often not supported or fixed)
        // Check latest docs: o1-preview / o1-mini supports specific params.
        // Assuming strict O1 mode:
        if (config.model.startsWith('o1')) {
            delete payload.temperature; // o1 usually relies on reasoning_effort or just doesn't support temp
            delete payload.top_p;
            delete payload.presence_penalty;
            delete payload.frequency_penalty;
        }

        return payload;
    }

    adaptMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
        // Renaming 'system' to 'developer'
        // And ensure no unsupported content types if strict
        return messages.map((m) => {
            if (m.role === 'system') {
                return { ...m, role: 'developer' } as OpenAI.Chat.ChatCompletionMessageParam;
            }
            return m as unknown as OpenAI.Chat.ChatCompletionMessageParam;
        });
    }
}

/**
 * Adapter for GPT-5 (Hypothetical / Future)
 * - Assuming similar to O1 trend: 'max_completion_tokens'
 * - 'developer' role
 * - Potentially new specific params
 */
export class GPT5Adapter extends O1Adapter {
    // GPT-5 might assume O1 characteristics (reasoning) or just be a superior GPT-4.
    // If user specifically requested "GPT-5" support based on "latest-model" guide:
    // The guide likely points to O1 behaviors (reasoning models).
    // So inheriting O1Adapter is a safe bet for "Next Gen" behavior for now.
    // We can customize further if specific GPT-5 specs are known (currently speculative/beta).

    adaptRequest(
        config: AIConfig,
        messages: OpenAI.Chat.ChatCompletionMessageParam[]
    ): OpenAI.Chat.ChatCompletionCreateParams {
        const payload = super.adaptRequest(config, messages);

        // Fix for GPT-5 / O1-like behavior where temperature must be 1 (default)
        // If we send it, even as 1, it might error if the API is strict about "unsupported param".
        // But the error said "unsupported value", implying passing it might be okay if it's 1?
        // Safest is to delete it and let default (1) take over.
        // O1Adapter only deletes if startsWith('o1'), so we must enforce here for gpt-5.

        if (payload.temperature !== 1) {
            delete payload.temperature;
            delete payload.top_p;
            delete payload.presence_penalty;
            delete payload.frequency_penalty;
        }

        return payload;
    }
}

/**
 * Factory to return the correct adapter
 */
export function getOpenAIAdapter(model: string): OpenAIModelAdapter {
    if (model.startsWith('o1') || model.startsWith('o3')) {
        return new O1Adapter();
    }
    if (model.toLowerCase().includes('gpt-5')) {
        return new GPT5Adapter();
    }
    return new DefaultOpenAIAdapter();
}
