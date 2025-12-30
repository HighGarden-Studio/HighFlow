/**
 * Database Seed Script
 *
 * Populates the database with sample data for development
 * Usage: pnpm db:seed
 */

import { db, schema } from '../electron/main/database/client';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // Create demo user
        const [user] = await db
            .insert(schema.users)
            .values({
                email: 'demo@workflow-manager.dev',
                name: 'Demo User',
                role: 'admin',
                timezone: 'UTC',
                locale: 'en',
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

        console.log(`✅ Created user: ${user.email}`);

        // Create demo team
        const [team] = await db
            .insert(schema.teams)
            .values({
                name: 'Demo Team',
                slug: 'demo-team',
                description: 'A demo team for testing',
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

        console.log(`✅ Created team: ${team.name}`);

        // Add user to team
        await db.insert(schema.teamMembers).values({
            teamId: team.id,
            userId: user.id,
            role: 'admin',
            permissions: {},
            joinedAt: new Date(),
        });

        // Create demo project
        const [project] = await db
            .insert(schema.projects)
            .values({
                title: 'HighFlow Development',
                description: 'Building an AI-powered project management tool',
                status: 'active',
                aiProvider: 'openai',
                ownerId: user.id,
                teamId: team.id,
                emoji: '🚀',
                color: '#3b82f6',
                estimatedHours: 160,
            })
            .returning();

        console.log(`✅ Created project: ${project.title}`);

        // Add user as project member
        await db.insert(schema.projectMembers).values({
            projectId: project.id,
            userId: user.id,
            role: 'admin',
            joinedAt: new Date(),
        });

        // Create diverse demo tasks - 서비스 기획/디자인/개발 작업 기반
        const mainTasks = [
            // ========== 기획 단계 (완료) ==========
            {
                title: '서비스 컨셉 및 핵심 기능 정의',
                description:
                    'HighFlow의 핵심 가치 제안과 주요 기능을 정의합니다. 타겟 사용자, 핵심 유즈케이스, 차별화 포인트를 명확히 합니다.',
                status: 'done' as const,
                priority: 'urgent' as const,
                order: 1,
                tags: ['기획', 'strategy', 'core'],
                estimatedMinutes: 240,
                aiProvider: 'anthropic',
            },
            {
                title: '경쟁사 분석 및 시장 조사',
                description:
                    'Notion, Linear, Jira 등 기존 프로젝트 관리 도구 분석. AI 기반 도구들(Cursor, GitHub Copilot Workspace 등) 벤치마킹.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 2,
                tags: ['기획', 'research', 'market'],
                estimatedMinutes: 480,
            },
            {
                title: '사용자 페르소나 및 시나리오 작성',
                description:
                    '주요 타겟 사용자(개발자, PM, 스타트업 창업자)별 페르소나를 정의하고 핵심 사용 시나리오를 작성합니다.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 3,
                tags: ['기획', 'UX', 'persona'],
                estimatedMinutes: 180,
            },

            // ========== 디자인 단계 (진행중/검토중) ==========
            {
                title: 'Design System 및 컴포넌트 라이브러리 구축',
                description:
                    '색상 팔레트, 타이포그래피, 간격 시스템, 아이콘 세트 등 디자인 시스템을 정의하고 재사용 가능한 컴포넌트 라이브러리를 구축합니다.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 4,
                tags: ['디자인', 'design-system', 'UI'],
                estimatedMinutes: 960,
                aiProvider: 'openai',
            },
            {
                title: '칸반 보드 UI/UX 디자인',
                description:
                    '드래그앤드롭 칸반 보드의 와이어프레임과 고해상도 목업을 제작합니다. 태스크 카드, 컬럼, 필터링 UI를 포함합니다.',
                status: 'in_review' as const,
                priority: 'high' as const,
                order: 5,
                tags: ['디자인', 'UI', 'kanban'],
                estimatedMinutes: 480,
                result: '칸반 보드 디자인 완료. Figma 링크: figma.com/file/xxx\n\n주요 디자인 결정사항:\n1. 다크 모드 기본 적용\n2. 태스크 카드에 AI 상태 뱃지 추가\n3. 드래그 시 시각적 피드백 강화',
            },
            {
                title: '대시보드 및 분석 화면 디자인',
                description:
                    '프로젝트 진행률, AI 사용량, 비용 분석 등을 시각화하는 대시보드 UI를 디자인합니다.',
                status: 'in_progress' as const,
                priority: 'medium' as const,
                order: 6,
                tags: ['디자인', 'UI', 'dashboard', 'analytics'],
                estimatedMinutes: 360,
            },
            {
                title: '모바일 반응형 디자인',
                description:
                    '태블릿 및 모바일 환경에서의 사용성을 고려한 반응형 디자인을 적용합니다.',
                status: 'todo' as const,
                priority: 'low' as const,
                order: 7,
                tags: ['디자인', 'responsive', 'mobile'],
                estimatedMinutes: 480,
            },

            // ========== 개발 단계 - 백엔드 (일부 완료) ==========
            {
                title: 'SQLite + Drizzle ORM 데이터베이스 설정',
                description:
                    '로컬 우선 아키텍처를 위한 SQLite 데이터베이스와 Drizzle ORM을 설정합니다. 마이그레이션 시스템 구축.',
                status: 'done' as const,
                priority: 'urgent' as const,
                order: 8,
                tags: ['개발', 'backend', 'database'],
                estimatedMinutes: 240,
                aiProvider: 'anthropic',
            },
            {
                title: 'AI 프로바이더 통합 (OpenAI, Anthropic, Google)',
                description:
                    '다중 AI 프로바이더 지원을 위한 추상화 레이어 구현. API 키 관리, 모델 선택, 비용 추적 기능 포함.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 9,
                tags: ['개발', 'backend', 'AI', 'integration'],
                estimatedMinutes: 720,
            },
            {
                title: 'MCP (Model Context Protocol) 서버 구현',
                description:
                    'Anthropic의 MCP를 활용한 도구 실행 환경 구축. 파일 시스템, Git, 터미널 도구 통합.',
                status: 'in_progress' as const,
                priority: 'high' as const,
                order: 10,
                tags: ['개발', 'backend', 'MCP', 'tools'],
                estimatedMinutes: 960,
                aiProvider: 'anthropic',
            },
            {
                title: 'Electron IPC 통신 레이어 구현',
                description:
                    'Renderer와 Main 프로세스 간 안전한 통신 채널 구현. 타입 안전성과 에러 핸들링 포함.',
                status: 'in_review' as const,
                priority: 'high' as const,
                order: 11,
                tags: ['개발', 'backend', 'electron', 'IPC'],
                estimatedMinutes: 360,
                result: `// IPC 핸들러 구현 예시
contextBridge.exposeInMainWorld('api', {
  tasks: {
    getAll: (projectId: number) => ipcRenderer.invoke('tasks:getAll', projectId),
    create: (task: TaskInput) => ipcRenderer.invoke('tasks:create', task),
    update: (id: number, data: Partial<Task>) => ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
  },
  // ... more handlers
});`,
            },

            // ========== 개발 단계 - 프론트엔드 (진행중) ==========
            {
                title: 'Vue 3 + TypeScript + Pinia 프로젝트 구조 설정',
                description:
                    'Vue 3 Composition API, TypeScript 엄격 모드, Pinia 스토어 아키텍처 설정.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 12,
                tags: ['개발', 'frontend', 'setup'],
                estimatedMinutes: 180,
            },
            {
                title: '태스크 CRUD 및 상태 관리 구현',
                description:
                    '태스크 생성, 조회, 수정, 삭제 기능과 Pinia 스토어를 통한 상태 관리 구현.',
                status: 'done' as const,
                priority: 'high' as const,
                order: 13,
                tags: ['개발', 'frontend', 'state-management'],
                estimatedMinutes: 480,
            },
            {
                title: 'AI 태스크 실행 및 스트리밍 UI 구현',
                description:
                    'AI 에이전트 실행 시 실시간 스트리밍 출력 표시, 진행 상황 표시, 중간 결과 프리뷰 기능.',
                status: 'in_progress' as const,
                priority: 'urgent' as const,
                order: 14,
                tags: ['개발', 'frontend', 'AI', 'streaming'],
                estimatedMinutes: 720,
                aiProvider: 'anthropic',
            },
            {
                title: '태스크 의존성 그래프 시각화',
                description:
                    '태스크 간 의존 관계를 시각적으로 표시하고 편집할 수 있는 그래프 UI 구현.',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 15,
                tags: ['개발', 'frontend', 'visualization', 'graph'],
                estimatedMinutes: 600,
            },
            {
                title: '설정 페이지 및 AI 프로바이더 설정 UI',
                description:
                    'API 키 설정, 기본 AI 모델 선택, 비용 한도 설정 등 사용자 설정 페이지 구현.',
                status: 'in_review' as const,
                priority: 'medium' as const,
                order: 16,
                tags: ['개발', 'frontend', 'settings'],
                estimatedMinutes: 360,
            },

            // ========== 테스트 및 QA ==========
            {
                title: 'E2E 테스트 환경 구축 (Playwright)',
                description:
                    'Playwright를 사용한 E2E 테스트 환경 설정. 주요 사용자 플로우에 대한 테스트 시나리오 작성.',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 17,
                tags: ['개발', 'testing', 'E2E', 'QA'],
                estimatedMinutes: 480,
            },
            {
                title: '유닛 테스트 커버리지 80% 달성',
                description: '핵심 비즈니스 로직에 대한 유닛 테스트 작성. Vitest 사용.',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 18,
                tags: ['개발', 'testing', 'unit-test'],
                estimatedMinutes: 720,
            },

            // ========== 배포 및 운영 ==========
            {
                title: 'Electron 빌드 및 코드 서명 설정',
                description:
                    'electron-builder를 사용한 macOS/Windows/Linux 빌드 설정. 코드 서명 및 공증 프로세스 구축.',
                status: 'todo' as const,
                priority: 'high' as const,
                order: 19,
                tags: ['개발', 'devops', 'build', 'release'],
                estimatedMinutes: 480,
            },
            {
                title: '자동 업데이트 시스템 구현',
                description:
                    'electron-updater를 사용한 자동 업데이트 기능 구현. 업데이트 알림 UI 및 롤백 기능.',
                status: 'todo' as const,
                priority: 'medium' as const,
                order: 20,
                tags: ['개발', 'devops', 'auto-update'],
                estimatedMinutes: 360,
            },
        ];

        // 부모 태스크 ID를 저장할 맵
        const taskIdMap: Record<string, number> = {};
        let projectSequence = 1;

        // 메인 태스크 생성
        for (const taskData of mainTasks) {
            const [task] = await db
                .insert(schema.tasks)
                .values({
                    projectId: project.id,
                    projectSequence: projectSequence++,
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
                    result: taskData.result || null,
                })
                .returning();

            taskIdMap[taskData.title] = task.id;
            console.log(`✅ Created task: ${task.title}`);
        }

        // 세분화된 서브태스크가 있는 그룹 태스크 생성
        const groupTaskTitle = 'MCP (Model Context Protocol) 서버 구현';
        const groupTaskId = taskIdMap[groupTaskTitle];

        if (groupTaskId) {
            // 부모 태스크를 세분화됨으로 표시
            await db
                .update(schema.tasks)
                .set({ isSubdivided: true })
                .where(eq(schema.tasks.id, groupTaskId));

            // 서브태스크 생성
            const subtasks = [
                {
                    title: 'MCP 프로토콜 스펙 분석',
                    description: 'Anthropic MCP 공식 문서 분석 및 구현 요구사항 정리',
                    status: 'done' as const,
                    priority: 'high' as const,
                    estimatedMinutes: 120,
                },
                {
                    title: 'MCP 서버 기본 구조 구현',
                    description: 'JSON-RPC 기반 MCP 서버 프레임워크 구현',
                    status: 'done' as const,
                    priority: 'high' as const,
                    estimatedMinutes: 240,
                },
                {
                    title: '파일 시스템 도구 구현',
                    description: 'read_file, write_file, list_directory 등 파일 시스템 도구',
                    status: 'in_progress' as const,
                    priority: 'high' as const,
                    estimatedMinutes: 180,
                },
                {
                    title: 'Git 도구 구현',
                    description: 'git_status, git_diff, git_commit 등 Git 통합 도구',
                    status: 'todo' as const,
                    priority: 'medium' as const,
                    estimatedMinutes: 180,
                },
                {
                    title: '터미널 실행 도구 구현',
                    description: '샌드박스 환경에서 안전한 셸 명령 실행',
                    status: 'todo' as const,
                    priority: 'medium' as const,
                    estimatedMinutes: 240,
                },
            ];

            for (let i = 0; i < subtasks.length; i++) {
                const subtaskData = subtasks[i];
                await db.insert(schema.tasks).values({
                    projectId: project.id,
                    projectSequence: projectSequence++,
                    parentTaskId: groupTaskId,
                    title: subtaskData.title,
                    description: subtaskData.description,
                    status: subtaskData.status,
                    priority: subtaskData.priority,
                    order: i + 1,
                    assigneeId: user.id,
                    executionType: 'serial',
                    tags: ['개발', 'MCP', 'subtask'],
                    watcherIds: [user.id],
                    estimatedMinutes: subtaskData.estimatedMinutes,
                });
                console.log(`  ↳ Created subtask: ${subtaskData.title}`);
            }
        }

        // 의존성 설정 (트리거 설정)
        // "AI 태스크 실행 및 스트리밍 UI 구현"이 완료되면 "태스크 의존성 그래프 시각화" 자동 실행
        const dependentTaskTitle = '태스크 의존성 그래프 시각화';
        const dependsOnTaskTitle = 'AI 태스크 실행 및 스트리밍 UI 구현';

        if (taskIdMap[dependentTaskTitle] && taskIdMap[dependsOnTaskTitle]) {
            await db
                .update(schema.tasks)
                .set({
                    triggerConfig: {
                        dependsOn: {
                            taskIds: [taskIdMap[dependsOnTaskTitle]],
                            operator: 'all',
                        },
                    },
                })
                .where(eq(schema.tasks.id, taskIdMap[dependentTaskTitle]));

            console.log(
                `✅ Set dependency: "${dependentTaskTitle}" depends on "${dependsOnTaskTitle}"`
            );
        }

        // 또 다른 의존성 설정
        const dependentTask2 = '유닛 테스트 커버리지 80% 달성';
        const dependsOnTask2 = 'E2E 테스트 환경 구축 (Playwright)';

        if (taskIdMap[dependentTask2] && taskIdMap[dependsOnTask2]) {
            await db
                .update(schema.tasks)
                .set({
                    triggerConfig: {
                        dependsOn: {
                            taskIds: [taskIdMap[dependsOnTask2]],
                            operator: 'all',
                        },
                    },
                })
                .where(eq(schema.tasks.id, taskIdMap[dependentTask2]));

            console.log(`✅ Set dependency: "${dependentTask2}" depends on "${dependsOnTask2}"`);
        }

        // Create demo template
        const [template] = await db
            .insert(schema.templates)
            .values({
                name: 'Web Application Starter',
                description: 'Full-stack web application with authentication and database',
                category: 'web',
                tags: ['web', 'fullstack', 'starter'],
                isPublic: true,
                isOfficial: true,
                authorId: user.id,
                projectStructure: {
                    tasks: [
                        {
                            title: 'Set up project repository',
                            description: 'Initialize Git repository and project structure',
                            priority: 'high',
                            estimatedMinutes: 30,
                        },
                        {
                            title: 'Configure database',
                            description: 'Set up PostgreSQL and migrations',
                            priority: 'high',
                            estimatedMinutes: 60,
                        },
                        {
                            title: 'Implement authentication',
                            description: 'Add user registration and login',
                            priority: 'high',
                            estimatedMinutes: 120,
                        },
                        {
                            title: 'Build frontend UI',
                            description: 'Create responsive user interface',
                            priority: 'medium',
                            estimatedMinutes: 240,
                        },
                    ],
                },
                aiProviderRecommendations: {
                    openai: {
                        model: 'gpt-4-turbo',
                        temperature: 0.7,
                        maxTokens: 2000,
                    },
                    anthropic: {
                        model: 'claude-3-5-sonnet-20250219',
                        temperature: 0.7,
                        maxTokens: 4000,
                    },
                },
            })
            .returning();

        console.log(`✅ Created template: ${template.name}`);

        // Create demo skill
        const [skill] = await db
            .insert(schema.skills)
            .values({
                name: 'Code Review',
                description: 'Reviews code for best practices, bugs, and improvements',
                prompt: `You are an expert code reviewer. Analyze the provided code and provide:
1. Potential bugs or issues
2. Security vulnerabilities
3. Performance improvements
4. Best practice violations
5. Suggestions for refactoring

Be specific and provide code examples for your suggestions.`,
                category: 'development',
                aiProvider: 'anthropic',
                mcpRequirements: [],
                isPublic: true,
                isOfficial: true,
                authorId: user.id,
                teamId: team.id,
                inputSchema: {
                    type: 'object',
                    properties: {
                        code: { type: 'string' },
                        language: { type: 'string' },
                        context: { type: 'string' },
                    },
                    required: ['code', 'language'],
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        bugs: { type: 'array', items: { type: 'string' } },
                        security: { type: 'array', items: { type: 'string' } },
                        performance: { type: 'array', items: { type: 'string' } },
                        suggestions: { type: 'array', items: { type: 'string' } },
                    },
                },
            })
            .returning();

        console.log(`✅ Created skill: ${skill.name}`);

        // Add skill tags
        await db.insert(schema.skillTags).values([
            { skillId: skill.id, tag: 'code-review' },
            { skillId: skill.id, tag: 'quality' },
            { skillId: skill.id, tag: 'best-practices' },
        ]);

        // Create demo automation
        await db.insert(schema.automations).values({
            projectId: project.id,
            name: 'Notify on Task Completion',
            description: 'Send notification when a task is marked as done',
            trigger: {
                type: 'task_status_changed',
                conditions: [
                    {
                        field: 'status',
                        operator: 'equals',
                        value: 'done',
                    },
                ],
            },
            actions: [
                {
                    type: 'send_notification',
                    config: {
                        title: 'Task Completed',
                        message: 'A task has been marked as done',
                        recipients: ['assignee', 'watchers'],
                    },
                },
            ],
            isEnabled: true,
            createdBy: user.id,
        });

        console.log('✅ Created automation');

        // Create AI provider config
        await db.insert(schema.aiProviderConfigs).values({
            userId: user.id,
            provider: 'openai',
            apiKey: 'sk-demo-key', // This would be encrypted in production
            settings: {
                model: 'gpt-4-turbo',
                temperature: 0.7,
                maxTokens: 2000,
            },
            isEnabled: true,
            monthlyBudget: 100,
            currentSpend: 0,
        });

        console.log('✅ Created AI provider config');

        // Create System Curator Operator
        await db.insert(schema.operators).values({
            name: 'System Curator',
            role: 'Curator',
            description: 'Manages project memory and context by organizing tasks and decisions.',
            projectId: null, // Global operator
            isCurator: true,
            aiProvider: 'openai',
            aiModel: 'gpt-4-turbo',
            tags: ['system', 'memory', 'context'],
            isActive: true,
            usageCount: 0,
            successRate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            avatar: '📸',
            systemPrompt: fs.readFileSync(
                path.join(process.cwd(), 'electron/resources/prompts/system/curator.md'),
                'utf-8'
            ),
        });

        console.log('✅ Created System Curator');

        console.log('\n🎉 Database seeded successfully!');
        console.log('\nDemo credentials:');
        console.log('Email: demo@workflow-manager.dev');
        console.log('User ID:', user.id);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

// Run seed
seed()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
