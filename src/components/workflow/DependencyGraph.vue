<script setup lang="ts">
/**
 * Dependency Graph
 *
 * Visual representation of task dependencies using a node-based graph.
 * Shows task relationships, execution order, and critical path.
 */

import { ref, computed, onMounted, watch, nextTick } from 'vue';
import type { Task } from '@electron/main/database/schema';

// ========================================
// Types
// ========================================

interface GraphNode {
  id: number;
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  column: number;
  isOnCriticalPath: boolean;
}

interface GraphEdge {
  from: number;
  to: number;
  type: 'dependency' | 'blocking' | 'parent-child';
  isOnCriticalPath: boolean;
}

interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  levels: number;
}

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
  tasks: Task[];
  selectedTaskId?: number;
  criticalPathTaskIds?: number[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', task: Task): void;
  (e: 'addDependency', fromId: number, toId: number): void;
  (e: 'removeDependency', fromId: number, toId: number): void;
}>();

// ========================================
// Constants
// ========================================

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 60;
const PADDING = 40;

// ========================================
// State
// ========================================

const svgContainer = ref<HTMLDivElement | null>(null);
const layout = ref<GraphLayout | null>(null);
const hoveredNodeId = ref<number | null>(null);
const isDragging = ref(false);
const draggedNodeId = ref<number | null>(null);
const viewBox = ref({ x: 0, y: 0, width: 800, height: 600 });
const scale = ref(1);
const panOffset = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

// ========================================
// Computed
// ========================================

const graphNodes = computed(() => layout.value?.nodes || []);
const graphEdges = computed(() => layout.value?.edges || []);

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  todo: { bg: '#374151', border: '#6B7280', text: '#D1D5DB' },
  in_progress: { bg: '#1E3A5F', border: '#3B82F6', text: '#93C5FD' },
  in_review: { bg: '#4C1D95', border: '#8B5CF6', text: '#C4B5FD' },
  done: { bg: '#064E3B', border: '#10B981', text: '#6EE7B7' },
  blocked: { bg: '#7F1D1D', border: '#EF4444', text: '#FCA5A5' },
};

const priorityIndicators: Record<string, string> = {
  low: '#6B7280',
  medium: '#F59E0B',
  high: '#F97316',
  urgent: '#EF4444',
};

// ========================================
// Layout Algorithm
// ========================================

function calculateLayout(): GraphLayout {
  if (props.tasks.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, levels: 0 };
  }

  // Build dependency map
  const taskMap = new Map<number, Task>(props.tasks.map(t => [t.id, t]));
  const dependsOnMap = new Map<number, Set<number>>();
  const dependedByMap = new Map<number, Set<number>>();

  for (const task of props.tasks) {
    dependsOnMap.set(task.id, new Set());
    dependedByMap.set(task.id, new Set());
  }

  // Parse dependencies from triggerConfig
  for (const task of props.tasks) {
    if (task.triggerConfig) {
      try {
        const config = typeof task.triggerConfig === 'string'
          ? JSON.parse(task.triggerConfig)
          : task.triggerConfig;

        if (config.dependsOn?.taskIds) {
          for (const depId of config.dependsOn.taskIds) {
            if (taskMap.has(depId)) {
              dependsOnMap.get(task.id)!.add(depId);
              dependedByMap.get(depId)!.add(task.id);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Also check blockedByTaskId
    if (task.blockedByTaskId && taskMap.has(task.blockedByTaskId)) {
      dependsOnMap.get(task.id)!.add(task.blockedByTaskId);
      dependedByMap.get(task.blockedByTaskId)!.add(task.id);
    }

    // Parent-child relationships
    if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
      dependsOnMap.get(task.id)!.add(task.parentTaskId);
      dependedByMap.get(task.parentTaskId)!.add(task.id);
    }
  }

  // Topological sort to determine levels
  const levels = new Map<number, number>();
  const visited = new Set<number>();
  const inProgress = new Set<number>();

  function calculateLevel(taskId: number): number {
    if (levels.has(taskId)) return levels.get(taskId)!;
    if (inProgress.has(taskId)) return 0; // Circular dependency

    inProgress.add(taskId);

    const dependencies = dependsOnMap.get(taskId) || new Set();
    let maxDepLevel = -1;

    for (const depId of dependencies) {
      maxDepLevel = Math.max(maxDepLevel, calculateLevel(depId));
    }

    inProgress.delete(taskId);
    visited.add(taskId);

    const level = maxDepLevel + 1;
    levels.set(taskId, level);
    return level;
  }

  for (const task of props.tasks) {
    calculateLevel(task.id);
  }

  // Group tasks by level
  const levelGroups = new Map<number, number[]>();
  for (const [taskId, level] of levels) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(taskId);
  }

  const maxLevel = Math.max(...levels.values(), 0);

  // Create nodes with positions
  const nodes: GraphNode[] = [];
  const criticalPathSet = new Set(props.criticalPathTaskIds || []);

  for (let level = 0; level <= maxLevel; level++) {
    const tasksAtLevel = levelGroups.get(level) || [];
    const y = PADDING + level * (NODE_HEIGHT + VERTICAL_GAP);

    tasksAtLevel.forEach((taskId, column) => {
      const task = taskMap.get(taskId)!;
      const x = PADDING + column * (NODE_WIDTH + HORIZONTAL_GAP);

      nodes.push({
        id: taskId,
        task,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        level,
        column,
        isOnCriticalPath: criticalPathSet.has(taskId),
      });
    });
  }

  // Create edges
  const edges: GraphEdge[] = [];

  for (const task of props.tasks) {
    const dependencies = dependsOnMap.get(task.id) || new Set();

    for (const depId of dependencies) {
      const edgeType: 'dependency' | 'blocking' | 'parent-child' =
        task.blockedByTaskId === depId ? 'blocking' :
        task.parentTaskId === depId ? 'parent-child' : 'dependency';

      edges.push({
        from: depId,
        to: task.id,
        type: edgeType,
        isOnCriticalPath: criticalPathSet.has(depId) && criticalPathSet.has(task.id),
      });
    }
  }

  // Calculate total dimensions
  const maxColumn = Math.max(...nodes.map(n => n.column), 0);
  const width = PADDING * 2 + (maxColumn + 1) * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
  const height = PADDING * 2 + (maxLevel + 1) * (NODE_HEIGHT + VERTICAL_GAP) - VERTICAL_GAP;

  return { nodes, edges, width, height, levels: maxLevel + 1 };
}

// ========================================
// Path Generation
// ========================================

function getEdgePath(edge: GraphEdge): string {
  const fromNode = graphNodes.value.find(n => n.id === edge.from);
  const toNode = graphNodes.value.find(n => n.id === edge.to);

  if (!fromNode || !toNode) return '';

  const x1 = fromNode.x + fromNode.width / 2;
  const y1 = fromNode.y + fromNode.height;
  const x2 = toNode.x + toNode.width / 2;
  const y2 = toNode.y;

  // Create a curved path
  const controlY = (y1 + y2) / 2;

  return `M ${x1} ${y1} C ${x1} ${controlY}, ${x2} ${controlY}, ${x2} ${y2}`;
}

function getEdgeColor(edge: GraphEdge): string {
  if (edge.isOnCriticalPath) return '#EF4444';
  switch (edge.type) {
    case 'blocking': return '#F97316';
    case 'parent-child': return '#8B5CF6';
    default: return '#6B7280';
  }
}

// ========================================
// Event Handlers
// ========================================

function handleNodeClick(node: GraphNode): void {
  emit('select', node.task);
}

function handleNodeHover(nodeId: number | null): void {
  hoveredNodeId.value = nodeId;
}

function handleZoom(delta: number): void {
  const newScale = Math.max(0.5, Math.min(2, scale.value + delta * 0.1));
  scale.value = newScale;
}

function handlePanStart(e: MouseEvent): void {
  if (e.button !== 0) return; // Only left mouse button

  isPanning.value = true;
  panStart.value = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y };
}

function handlePanMove(e: MouseEvent): void {
  if (!isPanning.value) return;

  panOffset.value = {
    x: e.clientX - panStart.value.x,
    y: e.clientY - panStart.value.y,
  };
}

function handlePanEnd(): void {
  isPanning.value = false;
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  handleZoom(e.deltaY > 0 ? -1 : 1);
}

function resetView(): void {
  scale.value = 1;
  panOffset.value = { x: 0, y: 0 };
}

function fitToView(): void {
  if (!layout.value || !svgContainer.value) return;

  const containerRect = svgContainer.value.getBoundingClientRect();
  const scaleX = containerRect.width / layout.value.width;
  const scaleY = containerRect.height / layout.value.height;
  scale.value = Math.min(scaleX, scaleY, 1) * 0.9;
  panOffset.value = { x: 0, y: 0 };
}

// ========================================
// Lifecycle
// ========================================

onMounted(() => {
  layout.value = calculateLayout();
  nextTick(() => fitToView());
});

watch(() => props.tasks, () => {
  layout.value = calculateLayout();
}, { deep: true });

watch(() => props.criticalPathTaskIds, () => {
  layout.value = calculateLayout();
});

// ========================================
// Helpers
// ========================================

function getStatusColor(status: string): typeof statusColors.todo {
  return statusColors[status] || statusColors.todo;
}

function getPriorityColor(priority: string): string {
  return priorityIndicators[priority] || priorityIndicators.medium;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}
</script>

<template>
  <div class="dependency-graph-container">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-group">
        <button @click="handleZoom(1)" class="toolbar-btn" title="확대">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button @click="handleZoom(-1)" class="toolbar-btn" title="축소">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>
        <span class="scale-indicator">{{ Math.round(scale * 100) }}%</span>
      </div>

      <div class="toolbar-group">
        <button @click="fitToView" class="toolbar-btn" title="화면에 맞추기">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button @click="resetView" class="toolbar-btn" title="초기화">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Legend -->
      <div class="legend">
        <div class="legend-item">
          <div class="legend-line dependency"></div>
          <span>의존성</span>
        </div>
        <div class="legend-item">
          <div class="legend-line blocking"></div>
          <span>블로킹</span>
        </div>
        <div class="legend-item">
          <div class="legend-line critical"></div>
          <span>크리티컬 패스</span>
        </div>
      </div>
    </div>

    <!-- Graph Area -->
    <div
      ref="svgContainer"
      class="graph-area"
      @mousedown="handlePanStart"
      @mousemove="handlePanMove"
      @mouseup="handlePanEnd"
      @mouseleave="handlePanEnd"
      @wheel="handleWheel"
      :class="{ panning: isPanning }"
    >
      <svg
        v-if="layout"
        :width="layout.width * scale"
        :height="layout.height * scale"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :style="{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }"
      >
        <defs>
          <!-- Arrow marker -->
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
          </marker>
          <marker
            id="arrowhead-critical"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#EF4444" />
          </marker>
        </defs>

        <!-- Edges -->
        <g class="edges">
          <path
            v-for="edge in graphEdges"
            :key="`${edge.from}-${edge.to}`"
            :d="getEdgePath(edge)"
            :stroke="getEdgeColor(edge)"
            :stroke-width="edge.isOnCriticalPath ? 3 : 2"
            :stroke-dasharray="edge.type === 'parent-child' ? '5,5' : 'none'"
            fill="none"
            :marker-end="edge.isOnCriticalPath ? 'url(#arrowhead-critical)' : 'url(#arrowhead)'"
            class="edge"
            :class="{
              'critical': edge.isOnCriticalPath,
              [edge.type]: true,
            }"
          />
        </g>

        <!-- Nodes -->
        <g class="nodes">
          <g
            v-for="node in graphNodes"
            :key="node.id"
            :transform="`translate(${node.x}, ${node.y})`"
            class="node"
            :class="{
              selected: selectedTaskId === node.id,
              hovered: hoveredNodeId === node.id,
              'critical-path': node.isOnCriticalPath,
            }"
            @click="handleNodeClick(node)"
            @mouseenter="handleNodeHover(node.id)"
            @mouseleave="handleNodeHover(null)"
          >
            <!-- Node background -->
            <rect
              :width="node.width"
              :height="node.height"
              :rx="8"
              :fill="getStatusColor(node.task.status).bg"
              :stroke="selectedTaskId === node.id ? '#3B82F6' : getStatusColor(node.task.status).border"
              :stroke-width="selectedTaskId === node.id ? 3 : 2"
            />

            <!-- Critical path indicator -->
            <rect
              v-if="node.isOnCriticalPath"
              :width="node.width"
              :height="4"
              :rx="2"
              fill="#EF4444"
            />

            <!-- Priority indicator -->
            <circle
              :cx="node.width - 16"
              :cy="16"
              r="6"
              :fill="getPriorityColor(node.task.priority)"
            />

            <!-- Task title -->
            <text
              :x="12"
              :y="28"
              :fill="getStatusColor(node.task.status).text"
              font-size="14"
              font-weight="600"
            >
              {{ truncateText(node.task.title, 20) }}
            </text>

            <!-- Task status -->
            <text
              :x="12"
              :y="48"
              fill="#9CA3AF"
              font-size="11"
            >
              {{ node.task.status.replace('_', ' ').toUpperCase() }}
            </text>

            <!-- Task ID -->
            <text
              :x="12"
              :y="68"
              fill="#6B7280"
              font-size="10"
            >
              #{{ node.task.id }}
            </text>

            <!-- Subtask indicator -->
            <g v-if="node.task.subtaskCount && node.task.subtaskCount > 0" :transform="`translate(${node.width - 50}, 55)`">
              <rect width="40" height="16" rx="4" fill="#1F2937" />
              <text x="20" y="12" fill="#9CA3AF" font-size="10" text-anchor="middle">
                {{ node.task.subtaskCount }} sub
              </text>
            </g>
          </g>
        </g>
      </svg>

      <!-- Empty state -->
      <div v-if="tasks.length === 0" class="empty-state">
        <svg class="w-16 h-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        <p class="mt-4 text-gray-500">태스크가 없습니다</p>
        <p class="text-sm text-gray-600">태스크를 추가하면 의존성 그래프가 표시됩니다</p>
      </div>
    </div>

    <!-- Info panel -->
    <div v-if="hoveredNodeId" class="info-panel">
      <template v-for="node in graphNodes.filter(n => n.id === hoveredNodeId)" :key="node.id">
        <h4 class="font-semibold text-gray-200">{{ node.task.title }}</h4>
        <p class="text-sm text-gray-400 mt-1">{{ node.task.description || '설명 없음' }}</p>
        <div class="mt-2 text-xs text-gray-500">
          <span class="mr-3">Level: {{ node.level }}</span>
          <span v-if="node.isOnCriticalPath" class="text-red-400">크리티컬 패스</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dependency-graph-container {
  @apply relative w-full h-full bg-gray-900 rounded-lg overflow-hidden;
}

.toolbar {
  @apply absolute top-4 left-4 z-10 flex items-center gap-4 bg-gray-800/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-700;
}

.toolbar-group {
  @apply flex items-center gap-2;
}

.toolbar-btn {
  @apply p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors;
}

.scale-indicator {
  @apply text-xs text-gray-500 min-w-[40px] text-center;
}

.legend {
  @apply flex items-center gap-4 text-xs text-gray-400 border-l border-gray-700 pl-4;
}

.legend-item {
  @apply flex items-center gap-1.5;
}

.legend-line {
  @apply w-6 h-0.5 rounded;
}

.legend-line.dependency {
  @apply bg-gray-500;
}

.legend-line.blocking {
  @apply bg-orange-500;
}

.legend-line.critical {
  @apply bg-red-500;
}

.graph-area {
  @apply w-full h-full cursor-grab overflow-hidden;
}

.graph-area.panning {
  @apply cursor-grabbing;
}

.graph-area svg {
  @apply transition-transform;
}

.node {
  @apply cursor-pointer transition-all;
}

.node:hover rect:first-child {
  filter: brightness(1.2);
}

.node.selected rect:first-child {
  filter: brightness(1.3);
}

.edge {
  @apply transition-all;
}

.edge:hover {
  stroke-width: 3;
}

.empty-state {
  @apply absolute inset-0 flex flex-col items-center justify-center text-center;
}

.info-panel {
  @apply absolute bottom-4 left-4 bg-gray-800/95 backdrop-blur-sm p-4 rounded-lg border border-gray-700 max-w-xs;
}
</style>
