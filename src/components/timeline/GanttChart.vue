<script setup lang="ts">
/**
 * Gantt Chart Component
 *
 * Visualizes tasks and dependencies on a timeline.
 * Supports Standard and Swimlane modes.
 */
import { computed, ref } from 'vue';
import type { Task } from '@core/types/database';

const props = defineProps<{
    tasks: Task[];
    viewMode: 'standard' | 'swimlane';
    zoomLevel: 'hour' | 'day' | 'week' | 'month';
    firstStartedAtMap?: Record<string, string>;
}>();

const emit = defineEmits<{
    (e: 'task-click', task: Task): void;
    (e: 'execute-task', task: Task): void;
    (e: 'approve-task', task: Task): void;
    (e: 'view-results', task: Task): void;
}>();

// Constants
const HEADER_HEIGHT = 50;
const SIDEBAR_WIDTH = 250;

// State
const scrollLeft = ref(0);
const scrollTop = ref(0);

// Computed Constants based on Zoom Level
const ROW_HEIGHT = computed(() => {
    // Hour view needs more space for all details and buttons
    return props.zoomLevel === 'hour' ? 130 : 80; // Increased to 130px for better spacing (124px after padding)
});

const PIXELS_PER_MS = computed(() => {
    switch (props.zoomLevel) {
        case 'hour':
            return 120 / (1000 * 60 * 60); // 120px per hour (doubled for more detail)
        case 'day':
            return 60 / (1000 * 60 * 60 * 24); // 60px per day
        case 'week':
            return 40 / (1000 * 60 * 60 * 24); // 40px per day
        case 'month':
            return 20 / (1000 * 60 * 60 * 24); // 20px per day
        default:
            return 60 / (1000 * 60 * 60 * 24);
    }
});

const TICK_WIDTH = computed(() => {
    switch (props.zoomLevel) {
        case 'hour':
            return 120; // Doubled for more detail
        case 'day':
            return 60;
        case 'week':
            return 40 * 7;
        case 'month':
            return 20 * 30; // Approx
        default:
            return 60;
    }
});

const isDetailedView = computed(() => props.zoomLevel === 'hour');

// Helper to get actual start date if available
function getActualStartDate(task: Task): Date | null {
    if (props.firstStartedAtMap && props.firstStartedAtMap[task.projectSequence]) {
        return new Date(props.firstStartedAtMap[task.projectSequence]);
    }
    if (task.startedAt) return new Date(task.startedAt);
    return null;
}

// Helper to get task duration in ms
function getTaskDurationMs(task: Task): number {
    const actualStart = getActualStartDate(task);

    if (actualStart) {
        if (task.completedAt) {
            const end = new Date(task.completedAt);
            const duration = end.getTime() - actualStart.getTime();
            return duration > 0 ? duration : 60 * 1000; // Min 1 min
        }

        // If currently running (in_progress), show elapsed time
        if (task.status === 'in_progress') {
            const duration = new Date().getTime() - actualStart.getTime();
            return duration > 0 ? duration : 60 * 1000;
        }

        // If started but paused/failed/todo (restarted?), show lifespan so far?
        // Or revert to estimated if not 'done'?
        // The user asked for "First Started At" to "Last Completed At".
        // If not completed, maybe just from First Start to Now?
        // Let's assume lifespan until now if started.
        const duration = new Date().getTime() - actualStart.getTime();
        return duration > 0 ? duration : 60 * 1000;
    }

    if (task.estimatedMinutes) {
        return task.estimatedMinutes * 60 * 1000;
    }
    return 24 * 60 * 60 * 1000; // Default 1 day
}

// Helper to get task start date
function getTaskStartDate(task: Task): Date {
    const actualStart = getActualStartDate(task);
    if (actualStart) return actualStart;

    if (task.dueDate) {
        const end = new Date(task.dueDate);
        const duration = getTaskDurationMs(task);
        return new Date(end.getTime() - duration);
    }
    return new Date(task.createdAt);
}

// Types
interface TimelineItem {
    type: 'task' | 'group';
    id?: string;
    name?: string;
    data?: Task;
    y: number;
    height: number;
    start?: Date;
    durationMs?: number;
}

interface DependencyPath {
    d: string;
    label: string | null;
    labelX: number;
    labelY: number;
}

// Processed Tasks with layout info
const processedTasks = computed<TimelineItem[]>(() => {
    // Sort tasks by start date
    const sorted = [...props.tasks].sort((a, b) => {
        return getTaskStartDate(a).getTime() - getTaskStartDate(b).getTime();
    });

    // Calculate layout
    let currentY = 0;
    const result: TimelineItem[] = [];

    // Grouping logic for Swimlanes
    if (props.viewMode === 'swimlane') {
        const mcpGroups: Record<string, Task[]> = {};
        const noMcpTasks: Task[] = [];

        sorted.forEach((task) => {
            if (task.requiredMCPs && task.requiredMCPs.length > 0) {
                const mcp = task.requiredMCPs[0];
                if (mcp) {
                    if (!mcpGroups[mcp]) mcpGroups[mcp] = [];
                    mcpGroups[mcp].push(task);
                }
            } else {
                noMcpTasks.push(task);
            }
        });

        const groups = [
            { id: 'general', name: 'General Tasks', tasks: noMcpTasks },
            ...Object.entries(mcpGroups).map(([name, tasks]) => ({
                id: name,
                name: `MCP: ${name}`,
                tasks,
            })),
        ];

        for (const group of groups) {
            if (group.tasks.length === 0) continue;

            // Group Header
            result.push({
                type: 'group',
                id: `group-${group.id}`,
                name: group.name,
                y: currentY,
                height: 50, // Increased from 30px for better visibility
            });
            currentY += 50;

            // Tasks in group
            group.tasks.forEach((task) => {
                const start = getTaskStartDate(task);
                const durationMs = getTaskDurationMs(task);
                result.push({
                    type: 'task',
                    data: task,
                    y: currentY,
                    height: ROW_HEIGHT.value,
                    start,
                    durationMs,
                });
                currentY += ROW_HEIGHT.value;
            });
        }
    } else {
        // Standard View
        sorted.forEach((task) => {
            const start = getTaskStartDate(task);
            const durationMs = getTaskDurationMs(task);
            result.push({
                type: 'task',
                data: task,
                y: currentY,
                height: ROW_HEIGHT.value,
                start,
                durationMs,
            });
            currentY += ROW_HEIGHT.value;
        });
    }

    return result;
});

// Timeline Range
const timelineRange = computed(() => {
    if (props.tasks.length === 0) {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        if (props.zoomLevel === 'hour') {
            start.setHours(start.getHours() - 12);
            end.setHours(end.getHours() + 24);
        } else {
            start.setDate(start.getDate() - 7);
            end.setDate(end.getDate() + 30);
        }
        return { start, end };
    }

    let min = new Date(8640000000000000);
    let max = new Date(-8640000000000000);

    props.tasks.forEach((task) => {
        const start = getTaskStartDate(task);
        const end = new Date(start.getTime() + getTaskDurationMs(task));

        if (start < min) min = start;
        if (end > max) max = end;
    });

    // Add padding
    if (props.zoomLevel === 'hour') {
        min.setHours(min.getHours() - 2);
        max.setHours(max.getHours() + 4);
    } else {
        min.setDate(min.getDate() - 2);
        max.setDate(max.getDate() + 5);
    }

    return { start: min, end: max };
});

// Generate Time Axis
const timeAxis = computed(() => {
    const { start, end } = timelineRange.value;
    const ticks = [];
    let current = new Date(start);

    // Align start to nearest unit
    if (props.zoomLevel === 'hour') {
        current.setMinutes(0, 0, 0);
    } else {
        current.setHours(0, 0, 0, 0);
    }

    while (current <= end) {
        ticks.push(new Date(current));
        if (props.zoomLevel === 'hour') {
            current.setHours(current.getHours() + 1);
        } else {
            current.setDate(current.getDate() + 1);
        }
    }

    return ticks;
});

// Calculate X position for a date
function getXForDate(date: Date): number {
    const start = timelineRange.value.start;
    const diffMs = date.getTime() - start.getTime();
    return diffMs * PIXELS_PER_MS.value;
}

// Get task bar style
function getTaskBarStyle(item: any) {
    const x = getXForDate(item.start);
    const width = Math.max(item.durationMs * PIXELS_PER_MS.value, 150); // Min width 150px (ensures Kanban card size)
    return {
        left: `${x}px`,
        width: `${width}px`,
        top: `${item.y + 3}px`, // Reduced padding for better fit
        height: `${item.height - 6}px`, // Reduced padding for better fit
    };
}

// Handle task click
function handleTaskClick(task: Task) {
    emit('task-click', task);
}

// Handle execute task
function handleExecuteTask(event: Event, task: Task) {
    event.stopPropagation();
    emit('execute-task', task);
}

// Check if task needs configuration
function needsConfiguration(task: Task): boolean {
    return !task.aiProvider || !task.aiModel;
}

// Check if task can be approved
function canApprove(task: Task): boolean {
    return task.status === 'needs_approval';
}

// Check if task has results
function hasResults(task: Task): boolean {
    return !!task.executionResult;
}

// Get task color based on status
function getTaskColor(status: string) {
    switch (status) {
        case 'done':
            return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100';
        case 'in_progress':
            return 'bg-blue-500/20 border-blue-500/50 text-blue-100';
        case 'in_review':
            return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-100';
        case 'blocked':
            return 'bg-red-500/20 border-red-500/50 text-red-100';
        default:
            return 'bg-gray-700/50 border-gray-600 text-gray-300';
    }
}

// Dependency Lines
const dependencyLines = computed<DependencyPath[]>(() => {
    const lines: DependencyPath[] = [];
    const taskMap = new Map<number, TimelineItem>();

    processedTasks.value.forEach((item) => {
        if (item.type === 'task' && item.data) {
            taskMap.set(item.data.id, item);
        }
    });

    props.tasks.forEach((task) => {
        // Explicit dependencies
        if (task.dependencies && Array.isArray(task.dependencies)) {
            task.dependencies.forEach((depId) => {
                const from = taskMap.get(depId);
                const to = taskMap.get(task.id);
                if (from && to) {
                    lines.push(calculatePath(from, to));
                }
            });
        }
        // Trigger dependencies
        if (
            task.triggerConfig?.dependsOn?.taskIds &&
            Array.isArray(task.triggerConfig.dependsOn.taskIds)
        ) {
            task.triggerConfig.dependsOn.taskIds.forEach((depId) => {
                const from = taskMap.get(depId);
                const to = taskMap.get(task.id);
                if (from && to) {
                    lines.push(calculatePath(from, to));
                }
            });
        }
    });

    return lines;
});

function calculatePath(from: TimelineItem, to: TimelineItem): DependencyPath {
    if (!from.start || !from.durationMs || !to.start || !from.data) {
        return { d: '', label: null, labelX: 0, labelY: 0 };
    }

    // Start from RIGHT edge of source task (end of from task)
    // Use actual width including minimum constraint (150px)
    const fromX = getXForDate(from.start);
    if (isNaN(fromX)) return { d: '', label: null, labelX: 0, labelY: 0 };

    const actualWidth = Math.max(from.durationMs * PIXELS_PER_MS.value, 150);
    const startX = fromX + actualWidth;
    const startY = from.y + from.height / 2;

    // End at LEFT edge of target task (start of to task)
    const endX = getXForDate(to.start);
    if (isNaN(endX)) return { d: '', label: null, labelX: 0, labelY: 0 };

    const endY = to.y + to.height / 2;

    // Calculate mid point for label
    const midX = startX + (endX - startX) / 2;
    const midY = startY + (endY - startY) / 2;

    // Data Flow Label (Output Format)
    const label = from.data.expectedOutputFormat || (from.data.executionResult ? 'Result' : null);

    // Cleaner curve with better control points
    const controlOffset = Math.min(Math.abs(endX - startX) / 3, 60); // Adaptive curve
    const verticalOffset = (endY - startY) * 0.3; // Smoother vertical transition

    return {
        d: `M ${startX} ${startY} C ${startX + controlOffset} ${startY + verticalOffset}, ${endX - controlOffset} ${endY - verticalOffset}, ${endX} ${endY}`,
        label,
        labelX: midX,
        labelY: midY,
    };
}
</script>

<template>
    <div class="flex h-full border border-gray-800 rounded-lg overflow-hidden bg-gray-900">
        <!-- Sidebar (Task Names) -->
        <div
            class="flex-shrink-0 border-r border-gray-800 bg-gray-800/50 overflow-hidden"
            :style="{ width: `${SIDEBAR_WIDTH}px`, marginTop: `${HEADER_HEIGHT}px` }"
        >
            <div class="relative" :style="{ transform: `translateY(-${scrollTop}px)` }">
                <div
                    v-for="item in processedTasks"
                    :key="item.id || item.data?.id"
                    class="border-b border-gray-800 px-4 flex items-center truncate"
                    :class="{
                        'bg-gray-800 font-bold text-gray-300': item.type === 'group',
                        'text-gray-400 text-sm hover:bg-gray-800/80': item.type === 'task',
                    }"
                    :style="{ height: `${item.height}px` }"
                >
                    {{ item.name || item.data?.title }}
                </div>
            </div>
        </div>

        <!-- Timeline Area -->
        <div class="flex-1 overflow-hidden relative flex flex-col">
            <!-- Time Axis Header -->
            <div
                class="h-[50px] border-b border-gray-800 bg-gray-800/80 overflow-hidden relative"
                ref="headerRef"
            >
                <div
                    class="absolute top-0 h-full flex items-end pb-2"
                    :style="{ transform: `translateX(-${scrollLeft}px)` }"
                >
                    <div
                        v-for="tick in timeAxis"
                        :key="tick.toISOString()"
                        class="flex-shrink-0 border-l border-gray-700 px-2 text-xs text-gray-500"
                        :style="{ width: `${TICK_WIDTH}px` }"
                    >
                        <template v-if="zoomLevel === 'hour'">
                            {{ tick.getHours() }}:00
                            <span class="text-[10px] block text-gray-600">{{
                                tick.getDate()
                            }}</span>
                        </template>
                        <template v-else>
                            {{ tick.getDate() }}
                            <span class="text-[10px] block">{{
                                tick.toLocaleDateString('en-US', { month: 'short' })
                            }}</span>
                        </template>
                    </div>
                </div>
            </div>

            <!-- Chart Body -->
            <div
                class="flex-1 overflow-auto relative bg-gray-900"
                @scroll="
                    (e) => {
                        scrollLeft = (e.target as HTMLElement).scrollLeft;
                        scrollTop = (e.target as HTMLElement).scrollTop;
                    }
                "
            >
                <div
                    class="relative min-h-full"
                    :style="{
                        width: `${timeAxis.length * TICK_WIDTH}px`,
                        height: `${processedTasks.reduce((acc, item) => acc + item.height, 0)}px`,
                    }"
                >
                    <!-- Grid Lines -->
                    <div
                        v-for="tick in timeAxis"
                        :key="`grid-${tick.toISOString()}`"
                        class="absolute top-0 bottom-0 border-l border-gray-800/50"
                        :style="{ left: `${getXForDate(tick)}px` }"
                    ></div>

                    <!-- Dependency Lines (SVG Layer) -->
                    <svg class="absolute inset-0 pointer-events-none z-10 w-full h-full">
                        <g v-for="(path, idx) in dependencyLines" :key="idx">
                            <path
                                :d="path.d"
                                fill="none"
                                stroke="#4B5563"
                                stroke-width="1.5"
                                marker-end="url(#arrowhead)"
                            />
                            <!-- Data Flow Label -->
                            <foreignObject
                                v-if="path.label"
                                :x="path.labelX - 40"
                                :y="path.labelY - 10"
                                width="80"
                                height="20"
                            >
                                <div class="flex justify-center items-center h-full">
                                    <span
                                        class="bg-gray-900 text-[10px] text-gray-400 px-1 border border-gray-700 rounded"
                                    >
                                        {{ path.label }}
                                    </span>
                                </div>
                            </foreignObject>
                        </g>
                        <defs>
                            <marker
                                id="arrowhead"
                                markerWidth="10"
                                markerHeight="7"
                                refX="9"
                                refY="3.5"
                                orient="auto"
                            >
                                <polygon points="0 0, 10 3.5, 0 7" fill="#4B5563" />
                            </marker>
                        </defs>
                    </svg>

                    <!-- Task Bars -->
                    <div v-for="item in processedTasks" :key="`bar-${item.id || item.data?.id}`">
                        <div
                            v-if="item.type === 'task' && item.data"
                            class="absolute rounded-lg shadow-lg border-2 flex flex-col justify-between p-2.5 pb-3 text-xs cursor-pointer hover:shadow-xl hover:scale-[1.01] transition-all z-20 overflow-hidden"
                            :class="getTaskColor(item.data.status)"
                            :style="getTaskBarStyle(item)"
                            @click="handleTaskClick(item.data)"
                        >
                            <!-- Hour View: Full Details -->
                            <template v-if="isDetailedView">
                                <!-- Header with Priority, Title, Config Warning -->
                                <div class="flex items-start justify-between gap-2 mb-2">
                                    <div class="flex items-center gap-2 flex-1 min-w-0">
                                        <!-- Priority Indicator -->
                                        <span
                                            v-if="item.data.priority"
                                            class="w-2 h-2 rounded-full shrink-0"
                                            :class="{
                                                'bg-red-500': item.data.priority === 'urgent',
                                                'bg-orange-500': item.data.priority === 'high',
                                                'bg-yellow-500': item.data.priority === 'medium',
                                                'bg-green-500': item.data.priority === 'low',
                                            }"
                                        ></span>
                                        <div class="font-bold truncate flex-1">
                                            {{ item.data.title }}
                                        </div>
                                    </div>
                                    <!-- Configuration Warning Badge -->
                                    <span
                                        v-if="needsConfiguration(item.data)"
                                        class="shrink-0 px-1.5 py-0.5 bg-yellow-600/80 text-yellow-100 rounded text-[9px] font-semibold"
                                        title="AI Configuration Required"
                                    >
                                        ⚙️ CONFIG
                                    </span>
                                </div>

                                <!-- AI Info -->
                                <div
                                    v-if="item.data.aiProvider || item.data.aiModel"
                                    class="flex items-center gap-1 text-[10px] mb-1.5 opacity-90"
                                >
                                    <svg
                                        class="w-3 h-3 opacity-70"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M13 10V3L4 14h7v7l9-11h-7z"
                                        />
                                    </svg>
                                    <span v-if="item.data.aiProvider" class="uppercase">
                                        {{ item.data.aiProvider }}
                                    </span>
                                    <span v-if="item.data.aiModel" class="truncate">
                                        : {{ item.data.aiModel }}
                                    </span>
                                </div>

                                <!-- Tags & Time -->
                                <div class="flex items-center gap-2 text-[10px] mb-2 flex-wrap">
                                    <span
                                        v-if="item.data.estimatedMinutes"
                                        class="flex items-center gap-0.5 opacity-75"
                                    >
                                        <svg
                                            class="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        {{ Math.floor(item.data.estimatedMinutes / 60) }}h
                                        {{ item.data.estimatedMinutes % 60 }}m
                                    </span>
                                    <div
                                        v-if="item.data.tags && item.data.tags.length > 0"
                                        class="flex gap-1 flex-wrap"
                                    >
                                        <span
                                            v-for="tag in item.data.tags.slice(0, 3)"
                                            :key="tag"
                                            class="px-1.5 py-0.5 bg-black/20 rounded text-[9px]"
                                        >
                                            {{ tag }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Action Buttons (Timeline Style - Compact Icons) -->
                                <div
                                    class="flex items-center gap-1 mt-auto pt-1.5 mb-0.5 border-t border-white/10"
                                >
                                    <!-- Execute Button -->
                                    <button
                                        v-if="
                                            item.data.status === 'todo' ||
                                            item.data.status === 'blocked'
                                        "
                                        @click="handleExecuteTask($event, item.data)"
                                        class="p-1.5 bg-blue-500/20 hover:bg-blue-500/40 rounded border border-blue-500/30 hover:border-blue-500/60 transition-all group/btn"
                                        title="Execute Task"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5 text-blue-400 group-hover/btn:text-blue-300"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"
                                            />
                                        </svg>
                                    </button>

                                    <!-- Approve Button -->
                                    <button
                                        v-if="canApprove(item.data)"
                                        @click.stop="$emit('approve-task', item.data)"
                                        class="p-1.5 bg-green-500/20 hover:bg-green-500/40 rounded border border-green-500/30 hover:border-green-500/60 transition-all group/btn"
                                        title="Approve Task"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5 text-green-400 group-hover/btn:text-green-300"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>

                                    <!-- View Results Button -->
                                    <button
                                        v-if="hasResults(item.data)"
                                        @click.stop="$emit('view-results', item.data)"
                                        class="p-1.5 bg-purple-500/20 hover:bg-purple-500/40 rounded border border-purple-500/30 hover:border-purple-500/60 transition-all group/btn"
                                        title="View Results"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5 text-purple-400 group-hover/btn:text-purple-300"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                            <path
                                                fill-rule="evenodd"
                                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </template>

                            <!-- Day/Week/Month View: Simplified -->
                            <template v-else>
                                <!-- Compact Header -->
                                <div class="flex items-center justify-between gap-1 mb-1">
                                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                                        <!-- Priority Dot -->
                                        <span
                                            v-if="item.data.priority"
                                            class="w-1.5 h-1.5 rounded-full shrink-0"
                                            :class="{
                                                'bg-red-500': item.data.priority === 'urgent',
                                                'bg-orange-500': item.data.priority === 'high',
                                                'bg-yellow-500': item.data.priority === 'medium',
                                                'bg-green-500': item.data.priority === 'low',
                                            }"
                                        ></span>
                                        <!-- Title -->
                                        <div class="font-semibold truncate text-[11px]">
                                            {{ item.data.title }}
                                        </div>
                                    </div>
                                    <!-- Status Badges -->
                                    <div class="flex gap-0.5 shrink-0">
                                        <span
                                            v-if="needsConfiguration(item.data)"
                                            class="w-1.5 h-1.5 rounded-full bg-yellow-500"
                                            title="Config Required"
                                        ></span>
                                        <span
                                            v-if="hasResults(item.data)"
                                            class="w-1.5 h-1.5 rounded-full bg-purple-500"
                                            title="Has Results"
                                        ></span>
                                    </div>
                                </div>

                                <!-- Compact Action Buttons (Icon Only) -->
                                <div class="flex items-center gap-0.5 mt-1">
                                    <button
                                        v-if="
                                            item.data.status === 'todo' ||
                                            item.data.status === 'blocked'
                                        "
                                        @click="handleExecuteTask($event, item.data)"
                                        class="flex-1 p-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded text-blue-400 hover:text-blue-300 transition-all"
                                        title="Execute"
                                    >
                                        <svg
                                            class="w-3 h-3 mx-auto"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        v-if="canApprove(item.data)"
                                        @click.stop="$emit('approve-task', item.data)"
                                        class="flex-1 p-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded text-green-400 hover:text-green-300 transition-all"
                                        title="Approve"
                                    >
                                        <svg
                                            class="w-3 h-3 mx-auto"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        v-if="hasResults(item.data)"
                                        @click.stop="$emit('view-results', item.data)"
                                        class="flex-1 p-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded text-purple-400 hover:text-purple-300 transition-all"
                                        title="Results"
                                    >
                                        <svg
                                            class="w-3 h-3 mx-auto"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                            <path
                                                fill-rule="evenodd"
                                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </template>
                        </div>
                        <!-- Group Background -->
                        <div
                            v-if="item.type === 'group'"
                            class="absolute left-0 right-0 bg-gradient-to-r from-gray-800/50 to-gray-700/50 border-y border-gray-700 flex items-center justify-center"
                            :style="{ top: `${item.y}px`, height: `${item.height}px` }"
                        >
                            <span class="text-sm font-bold text-gray-300 uppercase tracking-wider">
                                {{ item.name }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
