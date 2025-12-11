/**
 * Vue Router Configuration
 *
 * Application routing with navigation guards
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

/**
 * Route definitions
 */
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'home',
        redirect: '/projects',
    },
    {
        path: '/projects',
        name: 'projects',
        component: () => import('../views/ProjectsView.vue'),
        meta: {
            title: 'Projects',
        },
    },
    {
        path: '/projects/:id',
        name: 'project-detail',
        component: () => import('../views/ProjectDetailView.vue'),
        props: true,
        meta: {
            title: 'Project',
        },
    },
    {
        path: '/projects/:id/board',
        name: 'project-board',
        component: () => import('../views/KanbanBoardView.vue'),
        props: true,
        meta: {
            title: 'Board',
        },
    },
    {
        path: '/projects/:id/timeline',
        name: 'project-timeline',
        component: () => import('../views/TimelineView.vue'),
        props: true,
        meta: {
            title: 'Timeline',
        },
    },
    {
        path: '/projects/:id/dag',
        name: 'project-dag',
        component: () => import('../views/DAGView.vue'),
        props: true,
        meta: {
            title: 'DAG',
        },
    },
    {
        path: '/settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        meta: {
            title: 'Settings',
        },
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../views/NotFoundView.vue'),
        meta: {
            title: 'Not Found',
        },
    },
];

/**
 * Create router instance
 */
const router = createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior(_to, _from, savedPosition) {
        if (savedPosition) {
            return savedPosition;
        }
        return { top: 0 };
    },
});

/**
 * Navigation guards
 */
router.beforeEach((to, _from, next) => {
    // Update document title
    const title = to.meta.title as string | undefined;
    document.title = title ? `${title} - HighAIManager` : 'HighAIManager';

    next();
});

router.afterEach((_to, _from) => {
    // Analytics or other post-navigation logic can go here
});

export default router;
