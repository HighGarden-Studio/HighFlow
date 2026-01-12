# AI Services Documentation

> Complete guide to the AI integration module

---

## 📋 Overview

The AI Services module provides a comprehensive, production-ready AI integration layer with support for multiple AI providers, intelligent task decomposition, conversational requirements gathering, and autonomous agent execution.

### Key Features

✅ **Multi-Provider Support**: Claude (Anthropic), GPT (OpenAI), Gemini (Google)
✅ **Advanced Prompt Engine**: Intelligent prompt analysis and task decomposition
✅ **Conversational Flow**: Interactive requirements gathering with context retention
✅ **Skill Matching**: Automatic skill recommendations based on task analysis
✅ **MCP Integration**: Model Context Protocol tool discovery and execution
✅ **LangChain Patterns**: Chain execution and autonomous agents
✅ **Cost Optimization**: Automatic provider selection based on cost/quality trade-offs
✅ **Rate Limiting**: Built-in rate limiting and retry logic
✅ **Type Safety**: Full TypeScript support with strict mode

---

## 🏗️ Architecture

```
src/services/ai/
├── AdvancedAIEngine.ts           # Core AI engine
├── LangChainOrchestrator.ts      # Chain & agent orchestration
├── AIConfig.ts                   # Configuration & pricing
├── utils.ts                      # Utilities & helpers
├── index.ts                      # Public exports
└── providers/
    ├── BaseAIProvider.ts         # Abstract base class
    ├── ClaudeProvider.ts         # Anthropic Claude
    ├── GPTProvider.ts            # OpenAI GPT
    ├── GeminiProvider.ts         # Google Gemini
    └── ProviderFactory.ts        # Provider management

src/services/mcp/
└── MCPManager.ts                 # MCP integration manager

src/core/types/
└── ai.ts                         # Complete type definitions
```

---

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Add API keys to .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### 2. Basic Usage

```typescript
import { AdvancedAIEngine } from '@/services/ai';

const engine = new AdvancedAIEngine();

// Analyze a project prompt
const analysis = await engine.analyzeMainPrompt(
    'Build a real-time chat application with Vue 3 and WebSocket',
    {
        userId: 1,
        preferences: { preferredAI: 'anthropic' },
        skillLevel: 'intermediate',
        recentProjects: [],
        timezone: 'UTC',
    }
);

console.log(analysis.requirements);
console.log(analysis.estimatedComplexity);
console.log(analysis.suggestedTemplates);
```

---

## 📚 Core Components

### 1. AdvancedAIEngine

The main AI engine for intelligent project and task management.

#### Prompt Analysis

```typescript
const analysis = await engine.analyzeMainPrompt(prompt, userContext);

// Returns:
{
  requirements: RequirementGap[];      // Missing info to clarify
  suggestedTemplates: Template[];      // Matching templates
  estimatedComplexity: TaskComplexity; // simple|medium|complex
  recommendedAI: AIProvider;           // Best provider
  confidence: number;                  // 0-1
  detectedKeywords: string[];
  detectedDomain: string;
}
```

#### Conversational Requirements Gathering

```typescript
// Start conversation
const conversation = engine.createConversation(mainPrompt, userId);

// Generate follow-up questions
const questions = await engine.generateFollowUpQuestions(conversation, previousAnswers);

// Synthesize requirements
const structuredReq = await engine.synthesizeRequirements(mainPrompt, answers, template);
```

#### Task Decomposition

```typescript
const decomposition = await engine.decomposeTasks(requirement);

// Returns:
{
  tasks: Task[];                    // Actionable tasks
  dependencyGraph: DependencyGraph; // Task dependencies
  executionPlan: ExecutionPlan;     // Phased execution plan
  estimatedTime: number;            // Total minutes
  estimatedCost: number;            // Total cost in USD
  risks: Risk[];                    // Identified risks
}
```

#### Skill Recommendations

```typescript
const recommendations = await engine.recommendSkills(task, availableSkills);

// Each recommendation includes:
{
  skill: Skill;
  relevanceScore: number;           // 0-1
  reason: string;
  estimatedImpact: {
    timeReduction?: number;         // Percentage
    qualityImprovement?: number;
    costSaving?: number;
  };
  requiredMCPs: string[];
}
```

#### Provider Selection

```typescript
const selection = await engine.selectOptimalProvider(task, {
    maxCost: 0.05, // $0.05 max
    maxLatency: 2000, // 2 seconds max
    requiredFeatures: ['streaming', 'function_calling'],
});

// Returns:
{
    provider: AIProvider;
    model: AIModel;
    estimatedCost: number;
    estimatedTime: number;
    reasoning: string;
    alternatives: Array<{
        provider: AIProvider;
        model: AIModel;
        tradeoff: string;
    }>;
}
```

---

### 2. AI Providers

#### Claude Provider (Anthropic)

Best for: Long-form analysis, code review, complex reasoning

```typescript
import { ClaudeProvider } from '@/services/ai/providers/ClaudeProvider';

const claude = new ClaudeProvider();

// Execute
const response = await claude.execute(
    'Review this code for security issues',
    {
        model: 'claude-3-5-sonnet-20250219',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are a security expert...',
    },
    {
        userId: 1,
        taskId: 123,
    }
);

// Streaming
for await (const chunk of claude.streamExecute(prompt, config, (token) => {
    console.log(token); // Real-time tokens
})) {
    if (chunk.done) {
        console.log('Complete:', chunk.accumulated);
    }
}
```

**Models:**

- `claude-3-5-sonnet-20250219`: $3/M input, $15/M output, 200K context
- `claude-3-opus-20240229`: $15/M input, $75/M output (highest quality)
- `claude-3-haiku-20240307`: $0.25/M input, $1.25/M output (fastest)

#### GPT Provider (OpenAI)

Best for: Complex tasks, code generation, fast responses

```typescript
import { GPTProvider } from '@/services/ai/providers/GPTProvider';

const gpt = new GPTProvider();

const response = await gpt.execute('Generate a React component for user authentication', {
    model: 'gpt-4-turbo',
    temperature: 0.7,
    maxTokens: 2000,
    responseFormat: 'json', // Guaranteed JSON output
});
```

**Models:**

- `gpt-4-turbo`: $10/M input, $30/M output, 128K context
- `gpt-4`: $30/M input, $60/M output (8K context)
- `gpt-3.5-turbo`: $0.5/M input, $1.5/M output (fast & cheap)

#### Gemini Provider (Google)

Best for: Ultra-long context, multimodal, free tier

```typescript
import { GeminiProvider } from '@/services/ai/providers/GeminiProvider';

const gemini = new GeminiProvider();

const response = await gemini.execute('Summarize this entire codebase', {
    model: 'gemini-2.5-flash',
    temperature: 0.5,
    maxTokens: 8192,
});
```

**Models:**

- `gemini-2.5-pro`: $3.5/M input, $10.5/M output, 1M context
- `gemini-2.5-flash`: $0.075/M input, $0.3/M output (very cheap)
- `gemini-pro`: $0.5/M input, $1.5/M output (free tier available)

#### UI/UX Design Providers

Best for: 화면 설계, 하이파이 목업, UX 카피 생성

- **Figma AI**
    - Dev Mode AI, Flow Scribe를 통해 컴포넌트 구조/UX 카피/디자인 토큰을 자동 생성
    - 모델: `figma-design-agent`, `figma-flow-scribe`
    - 인증: Personal Access Token (`FIGMA_ACCESS_TOKEN`)
- **Galileo AI**
    - 고해상도 목업·디자인 시스템 제안, 사용자 시나리오 기반 플로우 설계
    - 모델: `galileo-studio`, `galileo-mockup-pro`
    - 인증: API Key
- **Uizard Autodesigner**
    - 와이어프레임, UX 카피, 플로우 다이어그램을 신속히 생성하는 경량형 도구
    - 모델: `uizard-autodesigner`, `uizard-wireflow`
    - 인증: API Key (무료 체험 제공)

이들 공급자는 설정 화면에서 `design` 태그로 필터링할 수 있으며, UI/UX 관련 태스크에서 우선 추천됩니다.

---

### 3. LangChain Orchestrator

Execute complex multi-step AI workflows with chains and agents.

#### Chain Execution

```typescript
import { LangChainOrchestrator } from '@/services/ai/LangChainOrchestrator';

const orchestrator = new LangChainOrchestrator();

const chainConfig: ChainConfig = {
    name: 'code-review-chain',
    steps: [
        {
            name: 'analyze',
            type: 'llm',
            config: {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet-20250219',
                prompt: 'Analyze this code: {{code}}',
                systemPrompt: 'You are a code reviewer...',
            },
        },
        {
            name: 'suggest-improvements',
            type: 'llm',
            config: {
                provider: 'openai',
                model: 'gpt-4-turbo',
                prompt: 'Based on {{analyze}}, suggest improvements',
            },
        },
        {
            name: 'generate-tests',
            type: 'tool',
            config: {
                tool: async (params: any) => {
                    // Custom tool logic
                    return 'Generated tests...';
                },
            },
        },
    ],
    memory: {
        type: 'buffer',
        maxTokens: 4000,
    },
    callbacks: {
        onProgress: (data) => console.log('Progress:', data.step),
        onComplete: (result) => console.log('Done:', result),
    },
};

const result = await orchestrator.executeChain(chainConfig, {
    code: 'function foo() { ... }',
});
```

#### Autonomous Agent

```typescript
const agentConfig: AgentConfig = {
    name: 'research-agent',
    objective: 'Research best practices for React performance optimization',
    thinkingMode: 'react', // 'react' | 'plan-and-execute' | 'reflection'
    maxIterations: 10,
    tools: [
        {
            name: 'search_web',
            description: 'Search the web for information',
            execute: async (params) => {
                // Web search implementation
                return 'Search results...';
            },
        },
        {
            name: 'read_documentation',
            description: 'Read technical documentation',
            execute: async (params) => {
                // Doc reading implementation
                return 'Documentation content...';
            },
        },
    ],
};

const result = await orchestrator.executeAgent(
    agentConfig,
    'What are the top 5 React performance optimization techniques?'
);

console.log(result.finalAnswer);
console.log(result.steps); // All reasoning steps
console.log(`Cost: $${result.cost.toFixed(4)}`);
```

---

### 4. MCP Manager

Discover, install, and execute Model Context Protocol integrations.

```typescript
import { MCPManager } from '@/services/mcp/MCPManager';

const mcpManager = new MCPManager();

// Discover available MCPs
const availableMCPs = await mcpManager.discoverMCPs();
// Returns: filesystem, github, postgres, slack, puppeteer, etc.

// Install an MCP
await mcpManager.installMCP(mcpIntegration);

// Suggest MCPs for a task
const suggestions = await mcpManager.suggestMCPsForTask(task);
// Returns ranked recommendations with confidence scores

// Execute an MCP tool
const result = await mcpManager.executeMCPTool(mcpId, 'read_file', { path: '/path/to/file.txt' });

// Health check
const health = await mcpManager.healthCheck(mcpId);
console.log(health.status); // 'healthy' | 'degraded' | 'down'
```

> 💡 **로컬 MCP 자동 설치 팁**  
> 설정 → MCP Servers에서 Install 버튼을 누르면 Electron이 `npm install -g ...` 또는 `pip install ...` 명령을 실행해 필요한 MCP 서버를 설치하고, 설치 로그와 상태를 UI에 표시합니다. 설치 후 Connect를 눌러 즉시 사용할 수 있습니다.

---

## 🛠️ Utilities

### Token Estimation

```typescript
import { estimateTokens, formatTokens } from '@/services/ai/utils';

const tokens = estimateTokens('Your text here...');
console.log(formatTokens(tokens)); // "125 tokens" or "1.5K tokens"
```

### Cost Calculation

```typescript
import { calculateCost, formatCost } from '@/services/ai/utils';

const cost = calculateCost({ prompt: 1000, completion: 500 }, { input: 3.0, output: 15.0 });
console.log(formatCost(cost)); // "$0.0105"
```

### JSON Extraction

```typescript
import { extractJSON } from '@/services/ai/utils';

const text = `Here's the data: \`\`\`json\n{"key": "value"}\n\`\`\``;
const data = extractJSON(text); // Extracts JSON from markdown
```

### Task Complexity Assessment

```typescript
import { assessTaskComplexity } from '@/services/ai/utils';

const complexity = assessTaskComplexity(task);
// Returns: 'simple' | 'medium' | 'complex'
```

### Rate Limiting

```typescript
import { RateLimitTracker, TokenBucket } from '@/services/ai/utils';

// Request-based rate limiting
const rateLimiter = new RateLimitTracker();
if (rateLimiter.isAllowed('openai', 60, 60000)) {
    // 60 requests per minute
    // Make API call
}

// Token bucket rate limiting
const bucket = new TokenBucket(1000, 10); // 1000 capacity, 10 tokens/sec
if (bucket.tryConsume(100)) {
    // Use 100 tokens
}
```

---

## 💰 Cost Optimization

### Automatic Provider Selection

The engine automatically selects the most cost-effective provider:

```typescript
// Low-cost, simple task
const result = await engine.selectOptimalProvider(simpleTask, {
    maxCost: 0.001, // 1/10th of a cent
});
// Likely selects: gemini-1.5-flash or gpt-3.5-turbo

// High-quality, complex task
const result = await engine.selectOptimalProvider(complexTask, {
    requiredFeatures: ['vision', 'function_calling'],
});
// Likely selects: claude-3-5-sonnet or gpt-4-turbo
```

### Cost Estimation

```typescript
import { AIServiceConfig } from '@/services/ai/AIConfig';

const estimatedCost = AIServiceConfig.estimateCost(
    'gpt-4-turbo',
    1000, // input tokens
    500 // output tokens
);
console.log(`Estimated: $${estimatedCost.toFixed(4)}`);
```

---

## 🔒 Security Best Practices

1. **API Key Management**: Store in environment variables, never commit
2. **Input Sanitization**: Use `sanitizeInput()` to prevent prompt injection
3. **Rate Limiting**: Built-in rate limiting to prevent abuse
4. **Cost Limits**: Set `maxCost` constraints to prevent runaway spending
5. **Error Handling**: All methods have built-in retry logic with exponential backoff

---

## 📊 Monitoring & Debugging

All providers automatically log execution metrics:

```typescript
// Console output:
[anthropic] execute {
  model: 'claude-3-5-sonnet-20250219',
  tokens: 1543,
  cost: '$0.0278',
  duration: '1823ms'
}
```

---

## 🧪 Testing

```typescript
// Mock provider for testing
import { BaseAIProvider } from '@/services/ai/providers/BaseAIProvider';

class MockProvider extends BaseAIProvider {
  readonly name = 'openai';
  readonly models = [...];

  async execute() {
    return {
      content: 'Mock response',
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      cost: 0.001,
      duration: 100,
      model: 'gpt-4-turbo',
      finishReason: 'stop',
      metadata: {},
    };
  }

  // ... implement other required methods
}
```

---

## 📈 Performance Tips

1. **Use Streaming**: For long responses, use `streamExecute()` for better UX
2. **Cache Context**: Reuse system prompts and context across similar tasks
3. **Batch Requests**: Group similar tasks to reduce overhead
4. **Choose Right Model**: Use cheaper models for simple tasks
5. **Set Token Limits**: Use `maxTokens` to prevent excessive generation
6. **Enable Context Caching**: Use Claude's context caching for repeated prompts

---

## 🐛 Troubleshooting

### Error: "ANTHROPIC_API_KEY not set"

```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-...
```

### Error: "Rate limit exceeded"

Wait for the retry period or use a different provider:

```typescript
const fallback = AIServiceConfig.getFallbackProvider('openai');
```

### Error: "Max tokens exceeded"

Reduce `maxTokens` or split into smaller chunks:

```typescript
import { chunkText } from '@/services/ai/utils';

const chunks = chunkText(largeText, 4000, 200); // 4K per chunk, 200 overlap
for (const chunk of chunks) {
    await provider.execute(chunk, config);
}
```

---

## 🔮 Future Enhancements

- [ ] Claude Code provider (CLI wrapper)
- [ ] Local model support (Ollama, LM Studio)
- [ ] Multi-modal support (images, audio)
- [ ] Fine-tuning integration
- [ ] Embeddings and vector search
- [ ] Advanced caching strategies
- [ ] Cost analytics dashboard

---

**Last Updated**: 2025-11-25
