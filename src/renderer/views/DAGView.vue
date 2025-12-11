<script setup lang="ts">
/**
 * DAG (Directed Acyclic Graph) View
 *
 * Visualizes task dependencies using D3.js with hierarchical and force-directed layouts
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import type { Task } from '@core/types/database';
import TaskDetailPanel from '../../components/task/TaskDetailPanel.vue';
import OperatorPanel from '../../components/project/OperatorPanel.vue';
import * as d3 from 'd3-selection';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { zoom, zoomIdentity } from 'd3-zoom';
import { drag } from 'd3-drag';

const route = useRoute();
const router = useRouter();
const taskStore = useTaskStore();
const projectStore = useProjectStore();
const uiStore = useUIStore();

// Refs
const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const layoutMode = ref<'hierarchical' | 'force'>('hierarchical');

// Task detail panel state
const selectedTaskId = ref<number | null>(null);
const selectedTask = computed(() => {
    if (!selectedTaskId.value) return null;
    return taskStore.tasks.find((t) => t.id === selectedTaskId.value) || null;
});
const showDetailPanel = ref(false);

// Connection mode state
const isConnecting = ref(false);
const connectionSource = ref<DAGNode | null>(null);
const tempConnectionLine = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

// Custom node positions (for manual positioning)
const customNodePositions = ref<Map<number, { x: number; y: number }>>(new Map());
const draggedNodeId = ref<number | null>(null);

// Constants
const NODE_WIDTH = 300;
const NODE_HEIGHT = 200;
const LEVEL_HEIGHT = 280;
const HORIZONTAL_SPACING = 100;

// SVG Icon paths for badges
function createSVGIcon(
    parent: any,
    iconType: string,
    x: number,
    y: number,
    size: number,
    color: string
) {
    const iconGroup = parent.append('g').attr('transform', `translate(${x}, ${y})`);

    switch (iconType) {
        case 'openai': // Sparkle icon
            iconGroup
                .append('path')
                .attr(
                    'd',
                    `M${size / 2} 0 L${size * 0.55} ${size * 0.45} L${size} ${size / 2} L${size * 0.55} ${size * 0.55} L${size / 2} ${size} L${size * 0.45} ${size * 0.55} L0 ${size / 2} L${size * 0.45} ${size * 0.45} Z`
                )
                .attr('fill', color);
            break;
        case 'anthropic': // Brain icon
            iconGroup
                .append('path')
                .attr(
                    'd',
                    `M${size * 0.3} ${size * 0.2} Q${size * 0.2} ${size * 0.3} ${size * 0.25} ${size * 0.5} T${size * 0.3} ${size * 0.8} M${size * 0.7} ${size * 0.2} Q${size * 0.8} ${size * 0.3} ${size * 0.75} ${size * 0.5} T${size * 0.7} ${size * 0.8} M${size * 0.3} ${size * 0.4} Q${size * 0.5} ${size * 0.35} ${size * 0.7} ${size * 0.4}`
                )
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', size * 0.1);
            break;
        case 'google': // Diamond/crystal icon
            iconGroup
                .append('path')
                .attr(
                    'd',
                    `M${size / 2} 0 L${size} ${size * 0.4} L${size / 2} ${size} L0 ${size * 0.4} Z`
                )
                .attr('fill', color);
            break;
        case 'gemini': // Gem icon
            iconGroup
                .append('path')
                .attr(
                    'd',
                    `M${size / 2} 0 L${size} ${size * 0.3} L${size * 0.85} ${size} L${size * 0.15} ${size} L0 ${size * 0.3} Z M${size * 0.25} ${size * 0.3} L${size * 0.5} ${size * 0.7} L${size * 0.75} ${size * 0.3} Z`
                )
                .attr('fill', color);
            break;
        case 'script': // Scroll/document icon
            iconGroup
                .append('rect')
                .attr('x', size * 0.15)
                .attr('y', 0)
                .attr('width', size * 0.7)
                .attr('height', size)
                .attr('rx', size * 0.1)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', size * 0.1);
            iconGroup
                .append('line')
                .attr('x1', size * 0.3)
                .attr('y1', size * 0.25)
                .attr('x2', size * 0.7)
                .attr('y2', size * 0.25)
                .attr('stroke', color)
                .attr('stroke-width', size * 0.08);
            iconGroup
                .append('line')
                .attr('x1', size * 0.3)
                .attr('y1', size * 0.5)
                .attr('x2', size * 0.7)
                .attr('y2', size * 0.5)
                .attr('stroke', color)
                .attr('stroke-width', size * 0.08);
            break;
        case 'file': // File icon
            iconGroup
                .append('path')
                .attr(
                    'd',
                    `M${size * 0.2} 0 L${size * 0.6} 0 L${size * 0.8} ${size * 0.2} L${size * 0.8} ${size} L${size * 0.2} ${size} Z`
                )
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', size * 0.1);
            break;
        case 'robot': // Robot icon (default)
        default:
            iconGroup
                .append('rect')
                .attr('x', size * 0.2)
                .attr('y', size * 0.3)
                .attr('width', size * 0.6)
                .attr('height', size * 0.5)
                .attr('rx', size * 0.1)
                .attr('fill', color);
            iconGroup
                .append('circle')
                .attr('cx', size * 0.35)
                .attr('cy', size * 0.5)
                .attr('r', size * 0.08)
                .attr('fill', 'white');
            iconGroup
                .append('circle')
                .attr('cx', size * 0.65)
                .attr('cy', size * 0.5)
                .attr('r', size * 0.08)
                .attr('fill', 'white');
            break;
    }
}

// Computed
const projectId = computed(() => Number(route.params.id));
const project = computed(() => projectStore.currentProject);
const tasks = computed(() => taskStore.tasks);

interface DAGNode {
    id: number;
    task: Task;
    x: number;
    y: number;
    fx?: number;
    fy?: number;
}

interface DAGEdge {
    source: DAGNode;
    target: DAGNode;
}

// Build graph data structure
const graphData = computed(() => {
    const nodes: DAGNode[] = [];
    const edges: DAGEdge[] = [];
    const nodeMap = new Map<number, DAGNode>();

    // Create nodes
    tasks.value.forEach((task) => {
        const node: DAGNode = {
            id: task.id,
            task,
            x: 0,
            y: 0,
        };
        nodes.push(node);
        nodeMap.set(task.id, node);
    });

    // Create edges from dependencies
    tasks.value.forEach((task) => {
        const dependencies = getTaskDependencies(task);
        dependencies.forEach((depId) => {
            const sourceNode = nodeMap.get(depId);
            const targetNode = nodeMap.get(task.id);
            if (sourceNode && targetNode) {
                edges.push({
                    source: sourceNode,
                    target: targetNode,
                });
            }
        });
    });

    return { nodes, edges };
});

// Calculate smart connection points based on relative node positions
function getConnectionPoints(source: DAGNode, target: DAGNode) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;

    // Determine which sides to connect based on angle
    const angle = Math.atan2(dy, dx);
    const absAngle = Math.abs(angle);

    // Arrow offset to keep arrows visible outside nodes
    const arrowOffset = 2; // Small offset for arrow visibility

    let sourceX, sourceY, targetX, targetY;

    // Determine source exit point
    if (absAngle < Math.PI / 4) {
        // Exit right
        sourceX = source.x + NODE_WIDTH / 2;
        sourceY = source.y;
    } else if (absAngle > (3 * Math.PI) / 4) {
        // Exit left
        sourceX = source.x - NODE_WIDTH / 2;
        sourceY = source.y;
    } else {
        // Exit bottom
        sourceX = source.x;
        sourceY = source.y + NODE_HEIGHT / 2;
    }

    // Determine target entry point (with offset for arrow visibility)
    if (absAngle < Math.PI / 4) {
        // Enter left
        targetX = target.x - NODE_WIDTH / 2 - arrowOffset;
        targetY = target.y;
    } else if (absAngle > (3 * Math.PI) / 4) {
        // Enter right
        targetX = target.x + NODE_WIDTH / 2 + arrowOffset;
        targetY = target.y;
    } else if (angle > 0) {
        // Enter top
        targetX = target.x;
        targetY = target.y - NODE_HEIGHT / 2 - arrowOffset;
    } else {
        // Enter bottom
        targetX = target.x;
        targetY = target.y + NODE_HEIGHT / 2 + arrowOffset;
    }

    return { sourceX, sourceY, targetX, targetY };
}

// Extract task dependencies from triggerConfig or legacy dependencies field
function getTaskDependencies(task: Task): number[] {
    // First try triggerConfig.dependsOn.taskIds (new format)
    if (task.triggerConfig?.dependsOn?.taskIds) {
        const taskIds = task.triggerConfig.dependsOn.taskIds;
        return Array.isArray(taskIds) ? taskIds : [];
    }

    // Fallback to legacy dependencies field
    if (task.dependencies) {
        if (Array.isArray(task.dependencies)) {
            return task.dependencies;
        }
        if (typeof task.dependencies === 'string') {
            try {
                const parsed = JSON.parse(task.dependencies);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
    }

    return [];
}

// Layout algorithms
function computeHierarchicalLayout(): { nodes: DAGNode[]; edges: DAGEdge[] } {
    const { nodes, edges } = graphData.value;
    if (nodes.length === 0) return { nodes, edges };

    // Build dependency map
    const dependencyMap = new Map<number, number[]>();
    nodes.forEach((node) => {
        dependencyMap.set(node.id, getTaskDependencies(node.task));
    });

    // Build reverse dependency map (who depends on this node)
    const reverseDeps = new Map<number, number[]>();
    nodes.forEach((node) => reverseDeps.set(node.id, []));
    nodes.forEach((node) => {
        const deps = dependencyMap.get(node.id) || [];
        deps.forEach((depId) => {
            if (reverseDeps.has(depId)) {
                reverseDeps.get(depId)!.push(node.id);
            }
        });
    });

    // Topological sorting with BFS
    const levelMap = new Map<number, number>();
    const inDegree = new Map<number, number>();

    // Initialize in-degree
    nodes.forEach((node) => {
        const deps = dependencyMap.get(node.id) || [];
        inDegree.set(node.id, deps.length);
    });

    // BFS queue - start with nodes that have no dependencies
    const queue: number[] = [];
    nodes.forEach((node) => {
        if (inDegree.get(node.id) === 0) {
            levelMap.set(node.id, 0);
            queue.push(node.id);
        }
    });

    // Process queue
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentLevel = levelMap.get(currentId) || 0;

        // Update dependent nodes
        const dependents = reverseDeps.get(currentId) || [];
        dependents.forEach((depId) => {
            const newDegree = (inDegree.get(depId) || 0) - 1;
            inDegree.set(depId, newDegree);

            if (newDegree === 0) {
                // Set level to max(dependencies) + 1
                const deps = dependencyMap.get(depId) || [];
                const maxLevel = deps.reduce((max, id) => Math.max(max, levelMap.get(id) || 0), -1);
                levelMap.set(depId, maxLevel + 1);
                queue.push(depId);
            }
        });
    }

    // Group by level
    const levels = new Map<number, DAGNode[]>();
    nodes.forEach((node) => {
        const level = levelMap.get(node.id) || 0;
        if (!levels.has(level)) levels.set(level, []);
        levels.get(level)!.push(node);
    });

    // Position nodes
    const maxLevel = levels.size > 0 ? Math.max(...Array.from(levels.keys())) : 0;
    const startX = 150;
    const levelSpacing = 450;

    for (let level = 0; level <= maxLevel; level++) {
        const nodesInLevel = levels.get(level) || [];
        nodesInLevel.sort((a, b) => a.id - b.id);

        const x = startX + level * levelSpacing;
        const totalHeight = nodesInLevel.length * LEVEL_HEIGHT;
        const startY = -totalHeight / 2 + LEVEL_HEIGHT / 2;

        nodesInLevel.forEach((node, idx) => {
            const customPos = customNodePositions.value.get(node.id);
            if (customPos) {
                node.x = customPos.x;
                node.y = customPos.y;
            } else {
                node.x = x;
                node.y = startY + idx * LEVEL_HEIGHT;
            }
        });
    }

    return { nodes, edges };
}

function computeForceLayout(): { nodes: DAGNode[]; edges: DAGEdge[] } {
    const { nodes, edges } = graphData.value;
    if (nodes.length === 0) return { nodes, edges };

    // Initialize positions - use custom if available, otherwise random
    nodes.forEach((node) => {
        const customPos = customNodePositions.value.get(node.id);
        if (customPos) {
            node.x = customPos.x;
            node.y = customPos.y;
            node.fx = customPos.x; // Fix position
            node.fy = customPos.y;
        } else {
            node.x = Math.random() * 1000 - 500;
            node.y = Math.random() * 1000 - 500;
        }
    });

    const simulation = forceSimulation(nodes as any)
        .force(
            'link',
            forceLink(edges as any)
                .id((d: any) => d.id)
                .distance(250)
        )
        .force('charge', forceManyBody().strength(-1000))
        .force('center', forceCenter(0, 0))
        .force('collision', forceCollide(NODE_WIDTH / 2 + 20));

    // Run simulation synchronously
    for (let i = 0; i < 300; i++) {
        simulation.tick();
    }
    simulation.stop();

    // Clear fixed positions
    nodes.forEach((node) => {
        delete node.fx;
        delete node.fy;
    });

    return { nodes, edges };
}

// Render DAG
async function renderDAG() {
    if (!svgRef.value || !containerRef.value) return;

    const svg = d3.select(svgRef.value);
    svg.selectAll('*').remove();

    // Create groups
    const g = svg.append('g').attr('class', 'dag-content');

    // Compute layout
    const { nodes, edges } =
        layoutMode.value === 'hierarchical' ? computeHierarchicalLayout() : computeForceLayout();

    // Draw edges
    const edgeGroup = g.append('g').attr('class', 'edges');
    edges.forEach((edge, edgeIndex) => {
        const source = edge.source as DAGNode;
        const target = edge.target as DAGNode;
        const { sourceX, sourceY, targetX, targetY } = getConnectionPoints(source, target);

        let path: string;

        if (layoutMode.value === 'hierarchical') {
            // For hierarchical layout, use vertical bezier curve
            const midY = (sourceY + targetY) / 2;
            path = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${targetX},${midY} ${targetX},${targetY}`;
        } else {
            // For force-directed layout, use quadratic curve
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            const offset = 30;
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 0) {
                const controlX = midX - (dy / len) * offset;
                const controlY = midY + (dx / len) * offset;
                path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
            } else {
                path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
            }
        }

        // Draw edge path without marker
        edgeGroup
            .append('path')
            .attr('class', 'edge-path')
            .attr('data-edge-index', edgeIndex)
            .attr('d', path)
            .attr('stroke', '#9CA3AF')
            .attr('stroke-width', 2)
            .attr('fill', 'none');

        // Draw arrow manually at target point
        const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
        const arrowSize = 8;
        const arrowPoints = [
            [targetX, targetY],
            [
                targetX - arrowSize * Math.cos(angle - Math.PI / 6),
                targetY - arrowSize * Math.sin(angle - Math.PI / 6),
            ],
            [
                targetX - arrowSize * Math.cos(angle + Math.PI / 6),
                targetY - arrowSize * Math.sin(angle + Math.PI / 6),
            ],
        ];

        edgeGroup
            .append('polygon')
            .attr('class', 'edge-arrow')
            .attr('data-edge-index', edgeIndex)
            .attr('points', arrowPoints.map((p) => p.join(',')).join(' '))
            .attr('fill', '#9CA3AF');

        // Add output format label on edge
        const sourceNode = edge.source as DAGNode;
        if (sourceNode.task.outputFormat) {
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;

            // Background for label
            edgeGroup
                .append('rect')
                .attr('class', 'edge-label-bg')
                .attr('data-edge-index', edgeIndex)
                .attr('x', midX - 35)
                .attr('y', midY - 12)
                .attr('width', 70)
                .attr('height', 24)
                .attr('rx', 4)
                .attr('fill', '#1F2937')
                .attr('stroke', '#9CA3AF')
                .attr('stroke-width', 1);

            // Label text
            edgeGroup
                .append('text')
                .attr('class', 'edge-label-text')
                .attr('data-edge-index', edgeIndex)
                .attr('x', midX)
                .attr('y', midY + 4)
                .attr('text-anchor', 'middle')
                .attr('fill', '#9CA3AF')
                .attr('font-size', 10)
                .attr('font-weight', '500')
                .text(sourceNode.task.outputFormat);
        }
    });

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');

    // Load all operators first for all tasks
    const operatorMap = new Map<number, any>();
    const tasksWithOperators = nodes.filter((n: DAGNode) => n.task.assignedOperatorId);

    for (const node of tasksWithOperators) {
        if (node.task.assignedOperatorId && !operatorMap.has(node.task.assignedOperatorId)) {
            try {
                const operator = await window.electron.operators.get(node.task.assignedOperatorId);
                operatorMap.set(node.task.assignedOperatorId, operator);
            } catch (error) {
                console.error(`Failed to load operator ${node.task.assignedOperatorId}:`, error);
            }
        }
    }

    // Render each node with operator data
    nodes.forEach((node: DAGNode) => {
        const operatorData = node.task.assignedOperatorId
            ? operatorMap.get(node.task.assignedOperatorId)
            : null;
        renderTaskNode(nodeGroup, node, operatorData);
    });

    // Add zoom behavior
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoomBehavior as any);

    // Fit to view
}

/**
 * Render a single task node
 */
function renderTaskNode(parent: any, node: DAGNode, operatorData: any = null) {
    const task = node.task;

    const nodeGroup = parent
        .append('g')
        .attr('class', 'task-node')
        .attr('transform', `translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`)
        .style('cursor', 'pointer');

    // Add drag behavior
    const dragBehavior = drag<SVGGElement, unknown>()
        .on('start', function (_event: any) {
            draggedNodeId.value = node.id;
            d3.select(this).raise().style('cursor', 'grabbing');
        })
        .on('drag', function (event: any) {
            // Update node position
            node.x = event.x;
            node.y = event.y;

            // Store custom position
            customNodePositions.value.set(node.id, { x: event.x, y: event.y });

            // Update visual position
            d3.select(this).attr(
                'transform',
                `translate(${event.x - NODE_WIDTH / 2}, ${event.y - NODE_HEIGHT / 2})`
            );

            // Redraw edges connected to this node
            redrawEdgesForNode(node);
        })
        .on('end', function (_event: any) {
            draggedNodeId.value = null;
            d3.select(this).style('cursor', 'pointer');
        });

    nodeGroup.call(dragBehavior as any);

    // Click handler (prevent during drag)
    let isDragging = false;
    nodeGroup.on('mousedown', () => {
        isDragging = false;
    });
    nodeGroup.on('mousemove', () => {
        isDragging = true;
    });
    nodeGroup.on('mouseup', function () {
        if (!isDragging) {
            handleNodeClick(task);
        }
        isDragging = false;
    });

    // Background
    // Status colors for border
    const statusColors: Record<string, string> = {
        todo: '#6B7280',
        in_progress: '#3B82F6',
        in_review: '#F59E0B',
        done: '#10B981',
        blocked: '#EF4444',
    };

    // operatorData is now passed as parameter from renderDAG

    // Card background with border (calculate height dynamically)
    let totalHeight = 0;
    const headerHeight = operatorData ? 65 : 48;
    const bodyMinHeight = 80; // Minimum for ID + title
    totalHeight = headerHeight + bodyMinHeight;

    const cardBg = nodeGroup
        .append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', totalHeight)
        .attr('rx', 8)
        .attr('fill', 'white')
        .attr('stroke', statusColors[task.status] || '#6B7280')
        .attr('stroke-width', task.status === 'in_progress' ? 4 : 3);

    // === HEADER SECTION (STATUS COLOR + OPACITY 0.5) ===
    const headerColor = statusColors[task.status] || '#6B7280';

    // Header background (status color + opacity 0.5)
    nodeGroup
        .append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', headerHeight)
        .attr('rx', 8)
        .attr('fill', headerColor)
        .attr('fill-opacity', 0.5);

    // Cover bottom corners
    nodeGroup
        .append('rect')
        .attr('y', headerHeight - 8)
        .attr('width', NODE_WIDTH)
        .attr('height', 8)
        .attr('fill', headerColor);

    let headerY = 5; // Reduced padding

    if (operatorData) {
        const opHeight = 26; // Reduced height

        nodeGroup
            .append('rect')
            .attr('x', 5)
            .attr('y', headerY)
            .attr('width', NODE_WIDTH - 10)
            .attr('height', opHeight)
            .attr('rx', 4)
            .attr('fill', 'black')
            .attr('fill-opacity', 0.3);

        // Operator content - centered alignment
        const opCenterY = headerY + opHeight / 2;

        // Avatar
        nodeGroup
            .append('text')
            .attr('x', 10)
            .attr('y', opCenterY + 4)
            .attr('font-size', 14)
            .attr('text-anchor', 'start')
            .text(operatorData.avatar || '🤖');

        // Name
        nodeGroup
            .append('text')
            .attr('x', 28)
            .attr('y', opCenterY - 2)
            .attr('fill', 'white')
            .attr('font-size', 10)
            .attr('font-weight', 'bold')
            .text(operatorData.name);

        // Role
        nodeGroup
            .append('text')
            .attr('x', 28)
            .attr('y', opCenterY + 8)
            .attr('fill', 'white')
            .attr('font-size', 8)
            .attr('opacity', 0.9)
            .text(operatorData.role);

        // Checkmark
        nodeGroup
            .append('path')
            .attr('d', `M${NODE_WIDTH - 25},${opCenterY - 4} l2,2 l4,-4`)
            .attr('stroke', 'white')
            .attr('stroke-width', 1.5)
            .attr('fill', 'none')
            .attr('stroke-linecap', 'round');

        headerY += opHeight + 4; // Reduced gap
    }

    // 2. Provider/Script section - black opacity 0.3 background
    const providerHeight = 28; // Reduced height

    nodeGroup
        .append('rect')
        .attr('x', 5)
        .attr('y', headerY)
        .attr('width', NODE_WIDTH - 10)
        .attr('height', providerHeight)
        .attr('rx', 4)
        .attr('fill', 'black')
        .attr('fill-opacity', 0.3);

    // Provider content - centered alignment
    const providerCenterY = headerY + providerHeight / 2;

    // Icon and text
    if (task.taskType === 'script' && task.scriptLanguage) {
        createSVGIcon(nodeGroup, 'script', 10, providerCenterY - 6, 12, 'white');
        nodeGroup
            .append('text')
            .attr('x', 26)
            .attr('y', providerCenterY + 3)
            .attr('fill', 'white')
            .attr('font-size', 10)
            .attr('font-weight', 'bold')
            .text(task.scriptLanguage);
    } else if (task.aiProvider) {
        const iconType = task.aiProvider.toLowerCase();
        createSVGIcon(nodeGroup, iconType, 10, providerCenterY - 6, 12, 'white');
        nodeGroup
            .append('text')
            .attr('x', 26)
            .attr('y', providerCenterY + 3)
            .attr('fill', 'white')
            .attr('font-size', 10)
            .attr('font-weight', 'bold')
            .text(task.aiProvider);

        // AI Model on right
        if (task.aiModel) {
            nodeGroup
                .append('text')
                .attr('x', NODE_WIDTH - 16)
                .attr('y', providerCenterY + 4)
                .attr('text-anchor', 'end')
                .attr('fill', 'white')
                .attr('font-size', 10)
                .attr('opacity', 0.9)
                .text(task.aiModel);
        }
    } else {
        createSVGIcon(nodeGroup, 'robot', 10, providerCenterY - 6, 12, 'white');
        nodeGroup
            .append('text')
            .attr('x', 26)
            .attr('y', providerCenterY + 3)
            .attr('fill', 'white')
            .attr('font-size', 9)
            .text('미설정');
    }

    // === BODY SECTION (DARK BACKGROUND) ===
    let bodyY = headerHeight + 5; // Reduced padding

    // Body background
    nodeGroup
        .append('rect')
        .attr('x', 0)
        .attr('y', headerHeight)
        .attr('width', NODE_WIDTH)
        .attr('height', totalHeight - headerHeight)
        .attr('fill', 'rgba(31, 41, 55, 0.3)');

    // Task ID with styled background
    const idColor = '#60A5FA';
    const idText = `#${task.projectSequence}`;
    const idWidth = idText.length * 8 + 12;

    // ID background (color + opacity 0.3)
    nodeGroup
        .append('rect')
        .attr('x', 12)
        .attr('y', bodyY - 2)
        .attr('width', idWidth)
        .attr('height', 20)
        .attr('rx', 4)
        .attr('fill', idColor)
        .attr('fill-opacity', 0.3)
        .attr('stroke', idColor)
        .attr('stroke-width', 1);

    // ID text
    nodeGroup
        .append('text')
        .attr('x', 12 + idWidth / 2)
        .attr('y', bodyY + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', idColor)
        .attr('font-weight', 'bold')
        .attr('font-size', 12)
        .text(idText);

    bodyY += 28;

    // Title
    const title = task.title.length > 28 ? task.title.substring(0, 25) + '...' : task.title;
    nodeGroup
        .append('text')
        .attr('x', 10)
        .attr('y', bodyY)
        .attr('fill', '#1F2937')
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .text(title);

    bodyY += 25;

    // Auto-run indicator
    if (task.autoExecuteOnDependencyComplete) {
        const autoGroup = nodeGroup.append('g');
        autoGroup
            .append('rect')
            .attr('x', 10)
            .attr('y', bodyY - 12)
            .attr('width', 90)
            .attr('height', 18)
            .attr('rx', 3)
            .attr('fill', '#DBEAFE');
        autoGroup
            .append('text')
            .attr('x', 15)
            .attr('y', bodyY)
            .attr('fill', '#1E40AF')
            .attr('font-size', 10)
            .attr('font-weight', '600')
            .text('⚡ Auto-run');
        bodyY += 20;
    }

    // Status badge
    const statusText =
        task.status === 'todo'
            ? 'To Do'
            : task.status === 'in_progress'
              ? 'In Progress'
              : task.status === 'needs_approval'
                ? 'Needs Approval'
                : task.status === 'in_review'
                  ? 'In Review'
                  : task.status === 'done'
                    ? 'Done'
                    : task.status === 'blocked'
                      ? 'Blocked'
                      : 'To Do'; // Status badge and action buttons area
    const bottomY = NODE_HEIGHT - 35;

    // Status badge (left side)
    nodeGroup
        .append('rect')
        .attr('x', 10)
        .attr('y', bottomY)
        .attr('width', 60)
        .attr('height', 24)
        .attr('rx', 12)
        .attr('fill', statusColors[task.status] || '#6B7280');

    nodeGroup
        .append('text')
        .attr('x', 40)
        .attr('y', bottomY + 15)
        .attr('text-anchor', 'middle')
        .attr('fill', '#FFFFFF')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .text(statusText);

    // Action Buttons - at bottom
    const buttonY = NODE_HEIGHT - 25;
    let actionButtonX = NODE_WIDTH - 15;

    // Execute button (for TODO tasks)
    if (task.status === 'todo') {
        const execBtn = nodeGroup.append('g').style('cursor', 'pointer');

        execBtn
            .append('circle')
            .attr('cx', actionButtonX)
            .attr('cy', buttonY)
            .attr('r', 12)
            .attr('fill', '#10B981')
            .attr('stroke', '#34D399')
            .attr('stroke-width', 1.5);

        execBtn
            .append('text')
            .attr('x', actionButtonX)
            .attr('y', buttonY + 1)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', 'white')
            .attr('font-size', 14)
            .text('▶');

        execBtn.on('click', function (event: any) {
            event.stopPropagation();
            handleTaskExecute(task);
        });

        actionButtonX -= 35;
    }

    // Approve button (for NEEDS_APPROVAL)
    if (task.status === 'needs_approval') {
        const approveBtn = nodeGroup.append('g').style('cursor', 'pointer');

        approveBtn
            .append('circle')
            .attr('cx', actionButtonX)
            .attr('cy', buttonY)
            .attr('r', 12)
            .attr('fill', '#F59E0B')
            .attr('stroke', '#FBBF24')
            .attr('stroke-width', 1.5);

        approveBtn
            .append('text')
            .attr('x', actionButtonX)
            .attr('y', buttonY + 1)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', 'white')
            .attr('font-size', 14)
            .text('✓');

        approveBtn.on('click', function (event: any) {
            event.stopPropagation();
            handleTaskApprove(task);
        });

        actionButtonX -= 35;
    }

    // Retry button (for failed REVIEW tasks)
    if (task.status === 'in_review' && task.executionResult?.success === false) {
        const retryBtn = nodeGroup.append('g').style('cursor', 'pointer');

        retryBtn
            .append('circle')
            .attr('cx', actionButtonX)
            .attr('cy', buttonY)
            .attr('r', 12)
            .attr('fill', '#F59E0B')
            .attr('stroke', '#FBBF24')
            .attr('stroke-width', 1.5);

        retryBtn
            .append('text')
            .attr('x', actionButtonX)
            .attr('y', buttonY + 1)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', 'white')
            .attr('font-size', 14)
            .text('↻');

        retryBtn.on('click', function (event: any) {
            event.stopPropagation();
            handleTaskExecute(task);
        });

        actionButtonX -= 35;
    }

    // View Results button (for completed)
    if (task.status === 'done' || task.status === 'in_review') {
        const viewBtn = nodeGroup.append('g').style('cursor', 'pointer');

        viewBtn
            .append('circle')
            .attr('cx', actionButtonX)
            .attr('cy', buttonY)
            .attr('r', 12)
            .attr('fill', '#8B5CF6')
            .attr('stroke', '#A78BFA')
            .attr('stroke-width', 1.5);

        viewBtn
            .append('text')
            .attr('x', actionButtonX)
            .attr('y', buttonY + 1)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', 'white')
            .attr('font-size', 14)
            .text('👁');

        viewBtn.on('click', function (event: any) {
            event.stopPropagation();
            handleNodeClick(task);
        });

        actionButtonX -= 35;
    }
    // Connection handle (right side, centered vertically)
    const handleGroup = nodeGroup
        .append('g')
        .attr('class', 'connection-handle')
        .style('cursor', 'crosshair')
        .style('opacity', 0)
        .attr('transform', `translate(${NODE_WIDTH}, ${NODE_HEIGHT / 2})`);

    // Handle background circle
    handleGroup
        .append('circle')
        .attr('cx', 8)
        .attr('cy', 0)
        .attr('r', 14)
        .attr('fill', '#3B82F6')
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 2.5);

    // Handle icon (plus sign)
    handleGroup
        .append('text')
        .attr('x', 8)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#FFFFFF')
        .attr('font-size', 18)
        .attr('font-weight', 'bold')
        .text('+');

    nodeGroup
        .on('mouseenter', function () {
            if (!isConnecting.value) {
                d3.select(this)
                    .select('.connection-handle')
                    .transition()
                    .duration(200)
                    .style('opacity', 1);
            }
        })
        .on('mouseleave', function () {
            if (!isConnecting.value) {
                d3.select(this)
                    .select('.connection-handle')
                    .transition()
                    .duration(200)
                    .style('opacity', 0);
            }
        });

    const handleDrag = drag<SVGGElement, unknown>()
        .on('start', function (_event: any) {
            isConnecting.value = true;
            connectionSource.value = node;

            // Get actual SVG coordinates of the handle
            const handleWorldX = node.x + NODE_WIDTH / 2 + 8;
            const handleWorldY = node.y;

            tempConnectionLine.value = {
                x1: handleWorldX,
                y1: handleWorldY,
                x2: handleWorldX,
                y2: handleWorldY,
            };

            drawTempConnectionLine();
        })
        .on('drag', function (event: any) {
            if (tempConnectionLine.value) {
                // Update end point with current mouse position
                tempConnectionLine.value.x2 = event.x;
                tempConnectionLine.value.y2 = event.y;
                updateTempConnectionLine();
            }
        })
        .on('end', function (event: any) {
            const targetNode = findNodeAtPosition(event.x, event.y);
            if (targetNode && targetNode.id !== node.id && connectionSource.value) {
                createDependency(connectionSource.value, targetNode);
            }
            isConnecting.value = false;
            connectionSource.value = null;
            tempConnectionLine.value = null;
            removeTempConnectionLine();
        });

    handleGroup.call(handleDrag as any);
}

function handleNodeClick(task: Task) {
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

function closeDetailPanel() {
    showDetailPanel.value = false;
    selectedTaskId.value = null;
}

async function handleTaskSave(updatedTask: Task) {
    await taskStore.updateTask(updatedTask.id, updatedTask);
}

async function handleTaskExecute(task: Task) {
    const result = await taskStore.executeTask(task.id);
    if (!result.success) {
        console.error('Failed to execute task:', result.error);
        uiStore.showToast({
            type: result.validationError ? 'warning' : 'error',
            message: result.error || '태스크 실행에 실패했습니다.',
            duration: 5000,
        });
    }
}

async function handleTaskApprove(task: Task) {
    const result = await taskStore.completeReview(task.id);
    if (!result.success) {
        console.error('Failed to approve task:', result.error);
        uiStore.showToast({
            type: 'error',
            message: result.error || '승인 처리에 실패했습니다.',
        });
        return;
    }
    uiStore.showToast({
        type: 'success',
        message: '태스크가 승인되었습니다.',
    });
    closeDetailPanel();
}

async function handleTaskReject(task: Task, feedback: string) {
    await taskStore.updateTask(task.id, {
        status: 'todo',
        description: task.description + '\n\n[Rejection Feedback]: ' + feedback,
    });
    closeDetailPanel();
}

async function handleTaskSubdivide(task: Task) {
    // Subdivision not implemented in DAG view yet
    console.log('Subdivide task:', task.id);
}

function handleNewTask() {
    selectedTaskId.value = null;
    showDetailPanel.value = true;
}

function drawTempConnectionLine() {
    if (!svgRef.value || !tempConnectionLine.value) return;

    const svg = d3.select(svgRef.value);
    const line = tempConnectionLine.value;

    // Remove existing temp connection
    svg.select('.temp-connection').remove();

    // Draw in the main group (dag-content) for proper coordinate transformation
    const dagGroup = svg.select('.dag-content');
    dagGroup
        .append('line')
        .attr('class', 'temp-connection')
        .attr('x1', line.x1)
        .attr('y1', line.y1)
        .attr('x2', line.x2)
        .attr('y2', line.y2)
        .attr('stroke', '#3B82F6')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '8,4')
        .attr('opacity', 0.8)
        .style('pointer-events', 'none');
}

function updateTempConnectionLine() {
    if (!svgRef.value || !tempConnectionLine.value) return;

    const svg = d3.select(svgRef.value);
    const line = tempConnectionLine.value;

    svg.select('.temp-connection').attr('x2', line.x2).attr('y2', line.y2);
}

function removeTempConnectionLine() {
    if (!svgRef.value) return;
    const svg = d3.select(svgRef.value);
    svg.selectAll('.temp-connection').remove();
}

function findNodeAtPosition(x: number, y: number): DAGNode | null {
    const { nodes } = graphData.value;
    return (
        nodes.find((node) => {
            const left = node.x - NODE_WIDTH / 2;
            const right = node.x + NODE_WIDTH / 2;
            const top = node.y - NODE_HEIGHT / 2;
            const bottom = node.y + NODE_HEIGHT / 2;
            return x >= left && x <= right && y >= top && y <= bottom;
        }) || null
    );
}

async function createDependency(source: DAGNode, target: DAGNode) {
    try {
        // Prevent self-dependency
        if (source.id === target.id) {
            console.warn('Cannot create dependency to self');
            return;
        }

        // Check for circular dependency
        if (wouldCreateCircularDependency(source.id, target.id)) {
            console.warn('Would create circular dependency');
            // TODO: Show toast notification
            return;
        }

        // Get target task
        const targetTask = taskStore.tasks.find((t) => t.id === target.id);
        if (!targetTask) return;

        // Check if dependency already exists
        const existingDeps = getTaskDependencies(targetTask);
        if (existingDeps.includes(source.id)) {
            console.warn('Dependency already exists');
            return;
        }

        // Update task dependencies
        const updatedTriggerConfig = {
            ...targetTask.triggerConfig,
            dependsOn: {
                ...targetTask.triggerConfig?.dependsOn,
                taskIds: [...existingDeps, source.id],
            },
        };

        await taskStore.updateTask(target.id, {
            triggerConfig: updatedTriggerConfig,
        });

        // Redraw DAG
        renderDAG();

        console.log(`Created dependency: Task ${source.id} → Task ${target.id}`);
    } catch (error) {
        console.error('Failed to create dependency:', error);
    }
}

function wouldCreateCircularDependency(sourceId: number, targetId: number): boolean {
    // Check if adding sourceId as dependency of targetId would create a cycle
    // This happens if targetId is already (directly or indirectly) a dependency of sourceId
    const visited = new Set<number>();

    function hasDependencyPath(from: number, to: number): boolean {
        if (from === to) return true;
        if (visited.has(from)) return false;
        visited.add(from);

        const fromTask = taskStore.tasks.find((t) => t.id === from);
        if (!fromTask) return false;

        const deps = getTaskDependencies(fromTask);
        return deps.some((depId) => hasDependencyPath(depId, to));
    }

    return hasDependencyPath(sourceId, targetId);
}

function redrawEdgesForNode(node: DAGNode) {
    if (!svgRef.value) return;

    const svg = d3.select(svgRef.value);
    const edges = graphData.value.edges;

    // Find all edges connected to this node
    const connectedEdges = edges.filter(
        (edge) => (edge.source as DAGNode).id === node.id || (edge.target as DAGNode).id === node.id
    );

    connectedEdges.forEach((edge) => {
        const source = edge.source as DAGNode;
        const target = edge.target as DAGNode;
        const edgeIndex = edges.indexOf(edge);

        const { sourceX, sourceY, targetX, targetY } = getConnectionPoints(source, target);

        let path: string;
        if (layoutMode.value === 'hierarchical') {
            const midY = (sourceY + targetY) / 2;
            path = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${targetX},${midY} ${targetX},${targetY}`;
        } else {
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            const offset = 30;
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 0) {
                const controlX = midX - (dy / len) * offset;
                const controlY = midY + (dx / len) * offset;
                path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
            } else {
                path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
            }
        }

        // Update path
        svg.select(`.edge-path[data-edge-index="${edgeIndex}"]`).attr('d', path);

        // Update arrow position and angle
        const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
        const arrowSize = 8;
        const arrowPoints = [
            [targetX, targetY],
            [
                targetX - arrowSize * Math.cos(angle - Math.PI / 6),
                targetY - arrowSize * Math.sin(angle - Math.PI / 6),
            ],
            [
                targetX - arrowSize * Math.cos(angle + Math.PI / 6),
                targetY - arrowSize * Math.sin(angle + Math.PI / 6),
            ],
        ];

        svg.select(`.edge-arrow[data-edge-index="${edgeIndex}"]`).attr(
            'points',
            arrowPoints.map((p) => p.join(',')).join(' ')
        );

        // Update label position if exists
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        svg.select(`.edge-label-bg[data-edge-index="${edgeIndex}"]`)
            .attr('x', midX - 35)
            .attr('y', midY - 12);

        svg.select(`.edge-label-text[data-edge-index="${edgeIndex}"]`)
            .attr('x', midX)
            .attr('y', midY + 4);
    });
}

function resetLayout() {
    customNodePositions.value.clear();
    renderDAG();
}

function fitToView() {
    if (!svgRef.value || !containerRef.value) return;

    const svg = d3.select(svgRef.value);
    const g = svg.select('.dag-content');
    const bbox = (g.node() as any)?.getBBox();

    if (!bbox) return;

    const width = containerRef.value.clientWidth;
    const height = containerRef.value.clientHeight;
    const scale = Math.min(width / bbox.width, height / bbox.height, 1) * 0.9;
    const translateX = width / 2 - (bbox.x + bbox.width / 2) * scale;
    const translateY = height / 2 - (bbox.y + bbox.height / 2) * scale;

    svg.transition()
        .duration(750)
        .call(
            (zoom() as any).transform,
            zoomIdentity.translate(translateX, translateY).scale(scale)
        );
}

function handleResetZoom() {
    fitToView();
}

// Lifecycle
onMounted(async () => {
    await projectStore.fetchProject(projectId.value);
    await taskStore.fetchTasks(projectId.value);
    await nextTick();
    renderDAG();
});

watch([tasks, layoutMode], () => {
    renderDAG();
});
</script>

<template>
    <div class="dag-view h-screen flex flex-col overflow-hidden">
        <!-- Operator Panel (Collapsible at Top) -->
        <OperatorPanel :project-id="projectId" />
        <!-- Header (same as Kanban) -->
        <header
            class="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0"
        >
            <div class="flex items-center gap-4">
                <button
                    @click="router.push('/projects')"
                    class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                    </svg>
                </button>
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <h1 class="text-xl font-bold text-white">{{ project?.title }}</h1>
                    </div>
                    <p class="text-gray-400 text-sm">DAG View</p>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <!-- View Switcher -->
                <div class="flex bg-gray-800 rounded-lg p-1">
                    <button
                        @click="router.push(`/projects/${projectId}`)"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        Overview
                    </button>
                    <button
                        @click="router.push(`/projects/${projectId}/board`)"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        Board
                    </button>
                    <button
                        @click="router.push(`/projects/${projectId}/timeline`)"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        Timeline
                    </button>
                    <button
                        class="px-3 py-1.5 text-sm font-medium bg-gray-700 text-white rounded-md shadow-sm transition-colors"
                    >
                        DAG
                    </button>
                </div>
                <button
                    class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                    @click="handleNewTask"
                >
                    + New Task
                </button>
            </div>
        </header>

        <!-- DAG Canvas Container -->
        <div ref="containerRef" class="relative flex-1 bg-gray-950">
            <!-- Controls -->
            <div class="absolute top-4 right-4 z-10 flex gap-2">
                <!-- Layout Toggle -->
                <div class="flex bg-gray-800 rounded-lg p-1">
                    <button
                        @click="layoutMode = 'hierarchical'"
                        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                        :class="
                            layoutMode === 'hierarchical'
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                        "
                    >
                        Hierarchical
                    </button>
                    <button
                        @click="layoutMode = 'force'"
                        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                        :class="
                            layoutMode === 'force'
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                        "
                    >
                        Force-Directed
                    </button>
                </div>

                <!-- Zoom Controls -->
                <button
                    @click="handleResetZoom"
                    class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                    title="Fit to view"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                    </svg>
                </button>

                <!-- Reset Layout -->
                <button
                    @click="resetLayout"
                    class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2"
                    title="Reset to original layout"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    <span class="text-xs">Reset</span>
                </button>
            </div>

            <!-- SVG Canvas -->
            <svg ref="svgRef" class="w-full h-full" xmlns="http://www.w3.org/2000/svg"></svg>

            <!-- Empty State -->
            <div
                v-if="tasks.length === 0"
                class="absolute inset-0 flex items-center justify-center"
            >
                <div class="text-center">
                    <svg
                        class="w-16 h-16 mx-auto text-gray-600 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <p class="text-gray-400 text-lg">No tasks to display</p>
                    <p class="text-gray-500 text-sm mt-2">Create tasks to visualize dependencies</p>
                </div>
            </div>
        </div>

        <!-- Task Detail Panel -->
        <Teleport to="body">
            <div v-if="showDetailPanel && selectedTask" class="fixed inset-0 z-50 flex">
                <div class="absolute inset-0 bg-black/60" @click="closeDetailPanel"></div>
                <div
                    class="relative ml-auto w-full max-w-2xl h-full bg-gray-800 border-l border-gray-700 shadow-2xl overflow-hidden"
                >
                    <TaskDetailPanel
                        :task="selectedTask"
                        :open="showDetailPanel"
                        @close="closeDetailPanel"
                        @save="handleTaskSave"
                        @execute="handleTaskExecute"
                        @approve="handleTaskApprove"
                        @reject="handleTaskReject"
                        @subdivide="handleTaskSubdivide"
                    />
                </div>
            </div>
        </Teleport>
    </div>
</template>
