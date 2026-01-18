<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAI } from '../../composables/useAI';
import type { Task } from '@core/types/database';
import type { AIProvider, Question, Answer } from '@core/types/ai';

interface Props {
  open: boolean;
}

interface Emits {
  (e: 'close'): void;
  (e: 'created', project: any): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

// Composables
const { analyzePrompt, generateQuestions, decomposeTasks, createConversation } = useAI();

// State
const currentStep = ref(1);
const totalSteps = 8;

// Step 1: Starting method
const startMethod = ref<'blank' | 'template' | 'clone'>('blank');

// Step 2: Main prompt
const mainPrompt = ref('');
const aiSuggestions = ref<string[]>([]);

// Step 3: AI provider
const selectedProvider = ref<AIProvider>('anthropic');

// Step 4: Conversational questions
const conversationId = ref('');
const questions = ref<Question[]>([]);
const answers = ref<Answer[]>([]);
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

// Step 5: Generated tasks
const generatedTasks = ref<Task[]>([]);
const dependencyGraph = ref<any>(null);
const estimatedCost = ref(0);
const estimatedTime = ref(0);

// Step 6: Team members
const teamMembers = ref<Array<{ userId: number; role: string }>>([]);

// Step 7: Git repository
const gitEnabled = ref(false);
const gitRepo = ref('');

// Step 8: Confirmation
const projectTitle = ref('');
const projectDescription = ref('');

// Computed
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return startMethod.value !== null;
    case 2:
      return mainPrompt.value.trim().length > 10;
    case 3:
      return selectedProvider.value !== null;
    case 4:
      return answers.value.length >= questions.value.length;
    case 5:
      return generatedTasks.value.length > 0;
    default:
      return true;
  }
});

// Methods
async function handlePromptAnalysis() {
  if (!mainPrompt.value.trim()) return;

  try {
    const conversation = createConversation(mainPrompt.value, 1); // TODO: Get real user ID
    conversationId.value = conversation.sessionId;

    const analysis = await analyzePrompt(mainPrompt.value, 1);

    // Add AI suggestions
    aiSuggestions.value = analysis.detectedKeywords;

    // Generate follow-up questions
    const newQuestions = await generateQuestions(conversationId.value, []);
    questions.value = newQuestions;

    // Add to chat
    chatMessages.value.push({
      role: 'user',
      content: mainPrompt.value,
    });
    chatMessages.value.push({
      role: 'assistant',
      content: `I understand you want to: ${analysis.detectedDomain}. Let me ask a few questions to better understand your requirements.`,
    });
  } catch (error) {
    console.error('Failed to analyze prompt:', error);
  }
}

async function handleAnswerSubmit(questionId: string, value: any) {
  const answer: Answer = {
    questionId,
    value,
    confidence: 1,
    timestamp: new Date(),
  };

  answers.value.push(answer);

  // Add to chat
  const question = questions.value.find((q) => q.id === questionId);
  if (question) {
    chatMessages.value.push({
      role: 'user',
      content: `${question.text}: ${value}`,
    });
  }

  // Check if we need more questions
  if (answers.value.length < questions.value.length) {
    return;
  }

  // Generate next set of questions or move to task generation
  try {
    const nextQuestions = await generateQuestions(conversationId.value, answers.value);
    if (nextQuestions.length > 0) {
      questions.value.push(...nextQuestions);
    }
  } catch (error) {
    console.error('Failed to generate questions:', error);
  }
}

async function handleTaskGeneration() {
  try {
    const decomposition = await decomposeTasks(mainPrompt.value, answers.value);

    generatedTasks.value = decomposition.tasks as any;
    dependencyGraph.value = decomposition.dependencyGraph;
    estimatedCost.value = decomposition.estimatedCost;
    estimatedTime.value = decomposition.estimatedTime;

    chatMessages.value.push({
      role: 'assistant',
      content: `I've generated ${decomposition.tasks.length} tasks for your project. Estimated time: ${Math.round(decomposition.estimatedTime / 60)} hours, Cost: $${decomposition.estimatedCost.toFixed(2)}`,
    });
  } catch (error) {
    console.error('Failed to generate tasks:', error);
  }
}

function nextStep() {
  if (currentStep.value === 2) {
    handlePromptAnalysis();
  } else if (currentStep.value === 4) {
    handleTaskGeneration();
  }

  if (currentStep.value < totalSteps) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

async function handleSubmit() {
  // TODO: Create project with generated data
  const project = {
    title: projectTitle.value || mainPrompt.value.substring(0, 50),
    description: projectDescription.value,
    mainPrompt: mainPrompt.value,
    aiProvider: selectedProvider.value,
    tasks: generatedTasks.value,
    teamMembers: teamMembers.value,
    gitRepository: gitEnabled.value ? gitRepo.value : null,
  };

  emit('created', project);
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-lg shadow-xl max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Create New Project
            </h2>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="emit('close')"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Progress bar -->
          <div class="mt-4">
            <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Step {{ currentStep }} of {{ totalSteps }}</span>
              <span>{{ Math.round((currentStep / totalSteps) * 100) }}% Complete</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-6">
          <!-- Step 1: Starting Method -->
          <div v-if="currentStep === 1" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              How would you like to start?
            </h3>

            <div class="grid grid-cols-3 gap-4">
              <button
                :class="[
                  'p-6 border-2 rounded-lg text-center transition-all',
                  startMethod === 'blank'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="startMethod = 'blank'"
              >
                <div class="text-4xl mb-2">📝</div>
                <div class="font-semibold text-gray-900 dark:text-white">Blank Project</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Start from scratch
                </div>
              </button>

              <button
                :class="[
                  'p-6 border-2 rounded-lg text-center transition-all',
                  startMethod === 'template'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="startMethod = 'template'"
              >
                <div class="text-4xl mb-2">📋</div>
                <div class="font-semibold text-gray-900 dark:text-white">From Template</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Use a proven template
                </div>
              </button>

              <button
                :class="[
                  'p-6 border-2 rounded-lg text-center transition-all',
                  startMethod === 'clone'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="startMethod = 'clone'"
              >
                <div class="text-4xl mb-2">📂</div>
                <div class="font-semibold text-gray-900 dark:text-white">Clone Project</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Duplicate existing
                </div>
              </button>
            </div>
          </div>

          <!-- Step 2: Main Prompt -->
          <div v-if="currentStep === 2" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Describe your project
            </h3>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What would you like to build?
              </label>
              <textarea
                v-model="mainPrompt"
                rows="6"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Example: Build a real-time chat application with Vue 3, WebSocket, and user authentication. Include message history, typing indicators, and file sharing."
              ></textarea>
            </div>

            <div v-if="aiSuggestions.length > 0" class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div class="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                💡 AI Suggestions
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="suggestion in aiSuggestions"
                  :key="suggestion"
                  class="px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-sm text-gray-700 dark:text-gray-300"
                >
                  {{ suggestion }}
                </span>
              </div>
            </div>
          </div>

          <!-- Step 3: AI Provider Selection -->
          <div v-if="currentStep === 3" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Select AI Provider
            </h3>

            <div class="grid grid-cols-3 gap-4">
              <button
                :class="[
                  'p-6 border-2 rounded-lg transition-all',
                  selectedProvider === 'anthropic'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="selectedProvider = 'anthropic'"
              >
                <div class="font-semibold text-lg mb-2">Claude (Anthropic)</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>💰 Cost: $3-$15/M tokens</div>
                  <div>⚡ Speed: Fast</div>
                  <div>🎯 Best for: Analysis, Code Review</div>
                </div>
              </button>

              <button
                :class="[
                  'p-6 border-2 rounded-lg transition-all',
                  selectedProvider === 'openai'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="selectedProvider = 'openai'"
              >
                <div class="font-semibold text-lg mb-2">GPT (OpenAI)</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>💰 Cost: $10-$30/M tokens</div>
                  <div>⚡ Speed: Very Fast</div>
                  <div>🎯 Best for: Code Generation</div>
                </div>
              </button>

              <button
                :class="[
                  'p-6 border-2 rounded-lg transition-all',
                  selectedProvider === 'google'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400',
                ]"
                @click="selectedProvider = 'google'"
              >
                <div class="font-semibold text-lg mb-2">Gemini (Google)</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>💰 Cost: $0.07-$3.5/M tokens</div>
                  <div>⚡ Speed: Ultra Fast</div>
                  <div>🎯 Best for: Long Context</div>
                </div>
              </button>
            </div>
          </div>

          <!-- Step 4: Conversational Questions -->
          <div v-if="currentStep === 4" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Let's refine your requirements
            </h3>

            <!-- Chat interface -->
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4 max-h-96 overflow-y-auto">
              <div
                v-for="(message, index) in chatMessages"
                :key="index"
                :class="[
                  'p-3 rounded-lg',
                  message.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900/30 ml-12'
                    : 'bg-white dark:bg-gray-700 mr-12',
                ]"
              >
                <div class="text-sm text-gray-900 dark:text-white">
                  {{ message.content }}
                </div>
              </div>
            </div>

            <!-- Current question -->
            <div v-if="answers.length < questions.length" class="space-y-4">
              <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div class="font-medium text-gray-900 dark:text-white mb-3">
                  {{ questions[answers.length]?.text }}
                </div>

                <input
                  v-if="questions[answers.length]?.type === 'text'"
                  type="text"
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
                  @keyup.enter="(e) => questions[answers.length] && handleAnswerSubmit(questions[answers.length]!.id, (e.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>

          <!-- Step 5: Generated Tasks Preview -->
          <div v-if="currentStep === 5" class="space-y-6">
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                Review Generated Tasks
              </h3>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {{ generatedTasks.length }} tasks • ${{ estimatedCost.toFixed(2) }} • {{ Math.round(estimatedTime / 60) }}h
              </div>
            </div>

            <div class="space-y-2">
              <div
                v-for="(task, index) in generatedTasks"
                :key="index"
                class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white">
                      {{ task.title }}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {{ task.description }}
                    </div>
                  </div>
                  <div class="ml-4 text-sm text-gray-500">
                    {{ task.estimatedMinutes }}min
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 6: Team Members -->
          <div v-if="currentStep === 6" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Invite Team Members (Optional)
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              You can add team members later from the project settings.
            </p>
          </div>

          <!-- Step 7: Git Integration -->
          <div v-if="currentStep === 7" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Connect Git Repository (Optional)
            </h3>

            <div>
              <label class="flex items-center space-x-3">
                <input
                  v-model="gitEnabled"
                  type="checkbox"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span class="text-gray-700 dark:text-gray-300">
                  Link this project to a Git repository
                </span>
              </label>
            </div>

            <div v-if="gitEnabled">
              <input
                v-model="gitRepo"
                type="text"
                placeholder="https://github.com/username/repository"
                class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
              />
            </div>
          </div>

          <!-- Step 8: Confirmation -->
          <div v-if="currentStep === 8" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
              Confirm Project Details
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Project Title
                </label>
                <input
                  v-model="projectTitle"
                  type="text"
                  :placeholder="mainPrompt.substring(0, 50)"
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  v-model="projectDescription"
                  rows="3"
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
                ></textarea>
              </div>

              <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">AI Provider:</span>
                  <span class="font-medium">{{ selectedProvider }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">Tasks:</span>
                  <span class="font-medium">{{ generatedTasks.length }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">Estimated Cost:</span>
                  <span class="font-medium">${{ estimatedCost.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">Estimated Time:</span>
                  <span class="font-medium">{{ Math.round(estimatedTime / 60) }} hours</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            v-if="currentStep > 1"
            class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
            @click="prevStep"
          >
            ← Back
          </button>
          <div v-else></div>

          <div class="flex items-center space-x-3">
            <button
              class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              @click="emit('close')"
            >
              Cancel
            </button>

            <button
              v-if="currentStep < totalSteps"
              :disabled="!canProceed"
              :class="[
                'px-6 py-2 rounded-lg font-medium transition',
                canProceed
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed',
              ]"
              @click="nextStep"
            >
              Continue →
            </button>

            <button
              v-else
              class="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              @click="handleSubmit"
            >
              Create Project
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
