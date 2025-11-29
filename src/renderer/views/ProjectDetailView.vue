<script setup lang="ts">
/**
 * Project Detail View
 *
 * Shows project overview and settings
 */
import { onMounted, computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectStore } from '../stores/projectStore';
import { useTaskStore } from '../stores/taskStore';
import InlineEdit from '../../components/common/InlineEdit.vue';
import ProjectInfoPanel from '../../components/project/ProjectInfoPanel.vue';

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const taskStore = useTaskStore();

// Props
const projectId = computed(() => Number(route.params.id));

// Local state
const editing = ref(false);
const editTitle = ref('');
const editDescription = ref('');

// Computed
const project = computed(() => projectStore.currentProject);
const loading = computed(() => projectStore.loading || taskStore.loading);

// Actions
function startEditing() {
  if (!project.value) return;
  editTitle.value = project.value.title;
  editDescription.value = project.value.description || '';
  editing.value = true;
}

async function saveEdits() {
  if (!project.value) return;

  await projectStore.updateProject(project.value.id, {
    title: editTitle.value.trim(),
    description: editDescription.value.trim(),
  });

  editing.value = false;
}

function cancelEditing() {
  editing.value = false;
}

// Inline edit handlers
async function handleTitleUpdate(newTitle: string) {
  if (!project.value || !newTitle.trim()) return;
  await projectStore.updateProject(project.value.id, { title: newTitle.trim() });
}

async function handleDescriptionUpdate(newDescription: string) {
  if (!project.value) return;
  await projectStore.updateProject(project.value.id, { description: newDescription.trim() });
}

function goToBoard() {
  router.push(`/projects/${projectId.value}/board`);
}

async function handleUpdateGuidelines(guidelines: string) {
  if (!project.value) return;
  await projectStore.updateProject(project.value.id, { aiGuidelines: guidelines });
}

// Lifecycle
onMounted(async () => {
  await projectStore.fetchProject(projectId.value);
  await taskStore.fetchTasks(projectId.value);
});
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-gray-900">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>

    <!-- Not Found -->
    <div
      v-else-if="!project"
      class="flex flex-col items-center justify-center h-full text-center"
    >
      <svg class="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <h3 class="text-lg font-medium text-gray-300 mb-2">Project not found</h3>
      <button
        @click="router.push('/projects')"
        class="text-blue-500 hover:text-blue-400"
      >
        Go back to projects
      </button>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Header -->
      <header class="border-b border-gray-800 px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button
              @click="router.push('/projects')"
              class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div v-if="!editing" class="flex-1">
              <InlineEdit
                :value="project.title"
                size="xl"
                @save="handleTitleUpdate"
              />
              <InlineEdit
                :value="project.description || ''"
                placeholder="Add description..."
                size="sm"
                class="mt-1 text-gray-400"
                @save="handleDescriptionUpdate"
              />
            </div>
            <div v-else class="flex-1 max-w-xl">
              <input
                v-model="editTitle"
                type="text"
                class="w-full text-2xl font-bold bg-transparent border-b border-gray-600 text-white focus:outline-none focus:border-blue-500 pb-1"
              />
              <textarea
                v-model="editDescription"
                rows="1"
                class="w-full text-sm bg-transparent border-b border-gray-700 text-gray-400 focus:outline-none focus:border-blue-500 mt-2 resize-none"
                placeholder="Add description..."
              ></textarea>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <template v-if="!editing">
              <button
                @click="startEditing"
                class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="goToBoard"
                class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Open Board
              </button>
            </template>
            <template v-else>
              <button
                @click="cancelEditing"
                class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                @click="saveEdits"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Save
              </button>
            </template>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Stats -->
          <div class="lg:col-span-2 space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-white">{{ taskStore.totalTasks }}</div>
                <div class="text-sm text-gray-400">Total Tasks</div>
              </div>
              <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-green-400">{{ taskStore.completedTasks }}</div>
                <div class="text-sm text-gray-400">Completed</div>
              </div>
              <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-blue-400">{{ taskStore.completionRate }}%</div>
                <div class="text-sm text-gray-400">Progress</div>
              </div>
              <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-yellow-400">{{ project.actualHours?.toFixed(1) || 0 }}</div>
                <div class="text-sm text-gray-400">Hours</div>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="bg-gray-800 rounded-lg p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-gray-300">Overall Progress</span>
                <span class="text-sm text-gray-400">{{ taskStore.completionRate }}%</span>
              </div>
              <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-500 rounded-full transition-all duration-300"
                  :style="{ width: `${taskStore.completionRate}%` }"
                ></div>
              </div>
            </div>

            <!-- Recent Tasks -->
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-white mb-4">Recent Tasks</h3>
              <div v-if="taskStore.tasks.length === 0" class="text-gray-500 text-center py-8">
                No tasks yet
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="task in taskStore.tasks.slice(0, 5)"
                  :key="task.id"
                  class="flex items-center gap-3 p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div
                    class="w-3 h-3 rounded-full"
                    :class="{
                      'bg-gray-500': task.status === 'todo',
                      'bg-blue-500': task.status === 'in_progress',
                      'bg-yellow-500': task.status === 'in_review',
                      'bg-green-500': task.status === 'done',
                      'bg-red-500': task.status === 'blocked',
                    }"
                  ></div>
                  <span class="text-gray-300 flex-1 truncate">{{ task.title }}</span>
                  <span
                    class="text-xs px-2 py-1 rounded-full"
                    :class="{
                      'bg-green-500/20 text-green-400': task.priority === 'low',
                      'bg-yellow-500/20 text-yellow-400': task.priority === 'medium',
                      'bg-orange-500/20 text-orange-400': task.priority === 'high',
                      'bg-red-500/20 text-red-400': task.priority === 'urgent',
                    }"
                  >
                    {{ task.priority }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Project Info Panel -->
            <ProjectInfoPanel
              :project="project"
              @edit="startEditing"
              @update-guidelines="handleUpdateGuidelines"
            />

            <!-- Quick Actions -->
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div class="space-y-2">
                <button
                  @click="goToBoard"
                  class="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Open Kanban Board
                </button>
                <button
                  class="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Generate with AI
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </template>
  </div>
</template>
