/**
 * Database Seed Module
 *
 * Seeds the database with sample data for development
 */

import { db, schema } from './client';
import { eq, count } from 'drizzle-orm';
import type { RunResult } from 'better-sqlite3';

function ensureEntity<T>(entity: T | undefined, name: string): T {
    if (!entity) {
        throw new Error(`Failed to create or fetch required entity: ${name}`);
    }
    return entity;
}

function firstInserted<T>(result: T[] | RunResult): T | undefined {
    if (Array.isArray(result)) {
        return result[0];
    }
    return undefined;
}

export async function seedDatabase(): Promise<void> {
    console.log('=== SEED DATABASE CALLED ===');
    console.log('🌱 Checking if database needs seeding...');
    // NOTE: This seed data was last synced with the actual database on 2025-12-01
    // To update with current data, run: pnpm tsx scripts/export-seed-data.ts

    try {
        // Check if data already exists
        const [existingUsers] = await db.select({ count: count() }).from(schema.users);
        if (existingUsers && existingUsers.count > 0) {
            console.log('Database already has data, skipping seed');
            return;
        }

        console.log('Seeding database with sample data...');

        // Create demo user
        const userResult = await db
            .insert(schema.users)
            .values({
                email: 'demo@workflow-manager.dev',
                name: 'Demo User',
                role: 'admin',
                timezone: 'Asia/Seoul',
                locale: 'ko',
                onboardingCompleted: true,
                preferences: {
                    defaultAI: 'openai',
                    theme: 'system',
                    notifications: {
                        email: true,
                        desktop: true,
                        mentions: true,
                        assignments: true,
                    },
                },
            })
            .returning();
        const user = ensureEntity(firstInserted(userResult), 'user');

        console.log(`✅ Created user: ${user.email}`);

        // Create demo team
        const teamResult = await db
            .insert(schema.teams)
            .values({
                name: 'Demo Team',
                slug: 'demo-team',
                description: '데모 팀',
                plan: 'pro',
                billingInfo: {},
                settings: {
                    permissions: {
                        canCreateProject: ['admin', 'member'],
                        canDeleteProject: ['admin'],
                        canInviteMembers: ['admin'],
                    },
                },
            })
            .returning();
        const team = ensureEntity(firstInserted(teamResult), 'team');

        // Add user to team
        await db.insert(schema.teamMembers).values({
            teamId: team.id,
            userId: user.id,
            role: 'admin',
            permissions: {},
            joinedAt: new Date(),
        });

        // Create demo project
        const projectResult = await db
            .insert(schema.projects)
            .values({
                title: 'HighFlow 개발',
                description: 'AI 기반 프로젝트 관리 도구 개발 프로젝트',
                status: 'active',
                aiProvider: 'anthropic',
                ownerId: user.id,
                teamId: team.id,
                emoji: '🚀',
                color: '#6366f1',
                estimatedHours: 200,
            })
            .returning();
        const project = ensureEntity(firstInserted(projectResult), 'project');

        console.log(`✅ Created project: ${project.title}`);

        // Add user as project member
        await db.insert(schema.projectMembers).values({
            projectId: project.id,
            userId: user.id,
            role: 'admin',
            joinedAt: new Date(),
        });

        // Create diverse demo tasks
        const mainTasks = [
            // 기획 단계 (완료)
            {
                title: '서비스 컨셉 및 핵심 기능 정의',
                description: 'HighFlow의 핵심 가치 제안과 주요 기능을 정의합니다.',
                status: 'done' as const,
                priority: 'urgent' as const,
                order: 1,
                tags: ['기획', 'strategy'],
                estimatedMinutes: 240,
            },
            {
                title: '경쟁사 분석 및 시장 조사',
                description: 'Notion, Linear, Jira 등 기존 프로젝트 관리 도구 분석',
                status: 'done' as const,
                priority: 'high' as const,
                order: 2,
                tags: ['기획', 'research'],
                estimatedMinutes: 480,
            },
            // 디자인 단계 (진행중)
            {
                title: 'Design System 구축',
                description: '색상 팔레트, 타이포그래피, 컴포넌트 라이브러리 정의',
                status: 'done' as const,
                priority: 'high' as const,
                order: 3,
                tags: ['디자인', 'UI'],
                estimatedMinutes: 960,
            },
            {
                title: '칸반 보드 UI/UX 디자인',
                description: '드래그앤드롭 칸반 보드의 와이어프레임과 목업 제작',
                status: 'in_review' as const,
                priority: 'high' as const,
                order: 4,
                tags: ['디자인', 'kanban'],
                estimatedMinutes: 480,
            },
            {
                title: '대시보드 디자인',
                description: '프로젝트 진행률, AI 사용량 등 분석 화면 디자인',
                status: 'in_progress' as const,
                priority: 'medium' as const,
                order: 5,
                tags: ['디자인', 'dashboard'],
                estimatedMinutes: 360,
            },
            // 개발 단계 - 백엔드
            {
                title: 'SQLite + Drizzle ORM 설정',
                description: '로컬 우선 아키텍처를 위한 데이터베이스 설정',
                status: 'done' as const,
                priority: 'urgent' as const,
                order: 6,
                tags: ['개발', 'database'],
                estimatedMinutes: 240,
                aiProvider: 'anthropic',
            },
            {
                title: 'AI 프로바이더 통합',
                description: 'OpenAI, Anthropic, Google AI 통합 구현',
                status: 'done' as const,
                priority: 'high' as const,
                order: 7,
                tags: ['개발', 'AI'],
                estimatedMinutes: 720,
            },
            {
                title: 'MCP 서버 구현',
                description: 'Model Context Protocol 서버 및 도구 통합',
                status: 'in_progress' as const,
                priority: 'high' as const,
                order: 8,
                tags: ['개발', 'MCP'],
                estimatedMinutes: 960,
                aiProvider: 'anthropic',
            },
            // 개발 단계 - 프론트엔드
            {
                title: 'Vue 3 프로젝트 구조 설정',
                description: 'Vue 3 + TypeScript + Pinia 설정',
                status: 'done' as const,
                priority: 'high' as const,
                order: 9,
                tags: ['개발', 'frontend'],
                estimatedMinutes: 180,
            },
            {
                title: 'AI 태스크 스트리밍 UI',
                description: 'AI 실행 시 실시간 스트리밍 출력 표시',
                status: 'in_progress' as const,
                priority: 'urgent' as const,
                order: 10,
                tags: ['개발', 'streaming'],
                estimatedMinutes: 720,
            },
            {
                title: '태스크 의존성 그래프',
                description: '태스크 간 의존 관계 시각화 구현',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 11,
                tags: ['개발', 'visualization'],
                estimatedMinutes: 600,
            },
            {
                title: '설정 페이지 구현',
                description: 'AI 프로바이더 설정 및 사용자 환경설정',
                status: 'in_review' as const,
                priority: 'medium' as const,
                order: 12,
                tags: ['개발', 'settings'],
                estimatedMinutes: 360,
            },
            // 테스트
            {
                title: 'E2E 테스트 환경 구축',
                description: 'Playwright E2E 테스트 설정',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 13,
                tags: ['테스트', 'E2E'],
                estimatedMinutes: 480,
            },
            {
                title: '유닛 테스트 작성',
                description: '핵심 로직 유닛 테스트',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 14,
                tags: ['테스트', 'unit'],
                estimatedMinutes: 720,
            },
            // 배포
            {
                title: 'Electron 빌드 설정',
                description: 'electron-builder 설정 및 코드 서명',
                status: 'todo' as const,
                priority: 'high' as const,
                order: 15,
                tags: ['배포', 'build'],
                estimatedMinutes: 480,
            },
        ];

        const taskIdMap: Record<string, number> = {};

        for (const taskData of mainTasks) {
            const taskInsertResult = await db
                .insert(schema.tasks)
                .values({
                    projectId: project.id,
                    title: taskData.title,
                    description: taskData.description,
                    status: taskData.status,
                    priority: taskData.priority,
                    order: taskData.order,
                    assigneeId: user.id,
                    executionType: 'serial',
                    tags: taskData.tags,
                    watcherIds: [user.id],
                    estimatedMinutes: taskData.estimatedMinutes,
                    aiProvider: taskData.aiProvider || null,
                })
                .returning();
            const task = ensureEntity(firstInserted(taskInsertResult), `task:${taskData.title}`);
            taskIdMap[taskData.title] = task.id;
        }

        console.log(`✅ Created ${mainTasks.length} tasks`);

        // Create subtasks for MCP task
        const mcpTaskId = taskIdMap['MCP 서버 구현'];
        if (mcpTaskId) {
            await db
                .update(schema.tasks)
                .set({ isSubdivided: true })
                .where(eq(schema.tasks.id, mcpTaskId));

            const subtasks = [
                { title: 'MCP 프로토콜 분석', status: 'done' as const, estimatedMinutes: 120 },
                { title: 'MCP 서버 기본 구조', status: 'done' as const, estimatedMinutes: 240 },
                {
                    title: '파일 시스템 도구',
                    status: 'in_progress' as const,
                    estimatedMinutes: 180,
                },
                { title: 'Git 도구 구현', status: 'todo' as const, estimatedMinutes: 180 },
                { title: '터미널 도구 구현', status: 'todo' as const, estimatedMinutes: 240 },
            ];

            for (const [index, subtask] of subtasks.entries()) {
                await db.insert(schema.tasks).values({
                    projectId: project.id,
                    parentTaskId: mcpTaskId,
                    title: subtask.title,
                    status: subtask.status,
                    priority: 'high',
                    order: index + 1,
                    assigneeId: user.id,
                    tags: ['MCP', 'subtask'],
                    estimatedMinutes: subtask.estimatedMinutes,
                });
            }
            console.log(`✅ Created ${subtasks.length} subtasks for MCP`);
        }

        // Set up dependencies
        const graphTaskId = taskIdMap['태스크 의존성 그래프'];
        const streamingTaskId = taskIdMap['AI 태스크 스트리밍 UI'];

        if (graphTaskId && streamingTaskId) {
            await db
                .update(schema.tasks)
                .set({
                    triggerConfig: {
                        dependsOn: { taskIds: [streamingTaskId], operator: 'all' },
                    },
                })
                .where(eq(schema.tasks.id, graphTaskId));
            console.log('✅ Set task dependency');
        }

        // Create second demo project - Task Dependency Demo
        const demoProjectResult = await db
            .insert(schema.projects)
            .values({
                title: '태스크 의존성 데모',
                description: '태스크 간 의존성과 매크로 치환 기능을 시연하는 프로젝트',
                status: 'active',
                aiProvider: 'openai',
                ownerId: user.id,
                teamId: team.id,
                emoji: '🔗',
                color: '#10b981',
                estimatedHours: 5,
            })
            .returning();
        const demoProject = ensureEntity(firstInserted(demoProjectResult), 'demo project');

        console.log(`✅ Created demo project: ${demoProject.title}`);

        // Add user as project member
        await db.insert(schema.projectMembers).values({
            projectId: demoProject.id,
            userId: user.id,
            role: 'admin',
            joinedAt: new Date(),
        });

        // Create dependency demo tasks
        const demoTasks = [
            {
                title: '1+1?',
                description: '1+1?',
                status: 'todo' as const,
                order: 0,
                aiProvider: 'openai',
                aiModel: 'gpt-4o',
                reviewAiProvider: 'openai',
                reviewAiModel: 'gpt-4o',
                autoReview: true,
                outputFormat: 'text',
                estimatedMinutes: 60,
            },
            {
                title: '2+2?',
                description: '2+2?',
                status: 'todo' as const,
                order: 1,
                aiProvider: 'openai',
                aiModel: 'gpt-4o',
                reviewAiProvider: 'openai',
                reviewAiModel: 'gpt-4o',
                autoReview: true,
                outputFormat: 'text',
                estimatedMinutes: 60,
                // Depends on task 1
                dependsOnTitle: '1+1?',
            },
            {
                title: 'n * m?',
                description: '{{task:1+1?}} * {{task:2+2?}}',
                status: 'todo' as const,
                order: 2,
                aiProvider: 'openai',
                aiModel: 'gpt-4o',
                reviewAiProvider: 'openai',
                reviewAiModel: 'gpt-4o',
                autoReview: true,
                outputFormat: 'text',
                estimatedMinutes: 60,
                // Depends on tasks 1 and 2
                dependsOnTitles: ['1+1?', '2+2?'],
            },
        ];

        const demoTaskIdMap: Record<string, number> = {};

        for (const taskData of demoTasks) {
            const { dependsOnTitle, dependsOnTitles, ...insertData } = taskData as any;
            const taskInsertResult = await db
                .insert(schema.tasks)
                .values({
                    projectId: demoProject.id,
                    ...insertData,
                    priority: 'medium',
                    executionType: 'serial',
                    assigneeId: user.id,
                    tags: [],
                    watcherIds: [user.id],
                })
                .returning();
            const task = ensureEntity(
                firstInserted(taskInsertResult),
                `demo task:${taskData.title}`
            );
            demoTaskIdMap[taskData.title] = task.id;
        }

        console.log(`✅ Created ${demoTasks.length} demo tasks`);

        // Set up dependency relationships
        const task1Id = demoTaskIdMap['1+1?'];
        const task2Id = demoTaskIdMap['2+2?'];
        const task3Id = demoTaskIdMap['n * m?'];

        if (task1Id && task2Id) {
            // Task 2 depends on task 1
            await db
                .update(schema.tasks)
                .set({
                    triggerConfig: {
                        dependsOn: {
                            taskIds: [task1Id],
                            operator: 'all',
                            executionPolicy: 'once',
                        },
                    },
                })
                .where(eq(schema.tasks.id, task2Id));
        }

        if (task1Id && task2Id && task3Id) {
            // Task 3 depends on tasks 1 and 2
            await db
                .update(schema.tasks)
                .set({
                    triggerConfig: {
                        dependsOn: {
                            taskIds: [task1Id, task2Id],
                            operator: 'all',
                            executionPolicy: 'once',
                        },
                    },
                })
                .where(eq(schema.tasks.id, task3Id));
        }

        console.log('✅ Set demo task dependencies');

        console.log('🎉 Database seeded successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    }
}
