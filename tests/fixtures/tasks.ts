/**
 * Task Test Fixtures
 *
 * Sample data for testing task-related functionality.
 */

export interface TaskFixture {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  tags: string[];
  dependencies: string[];
  estimatedTime?: number;
  actualTime?: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}

export interface ProjectFixture {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'archived';
  mainPrompt: string;
  aiProvider: 'openai' | 'anthropic' | 'google';
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Project Fixtures
// ==========================================

export const mockProjects: ProjectFixture[] = [
  {
    id: 'project-1',
    name: '소셜 미디어 앱',
    description: '인스타그램 클론 프로젝트',
    status: 'active',
    mainPrompt: '인스타그램과 유사한 사진 공유 소셜 미디어 앱을 만들어주세요',
    aiProvider: 'anthropic',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'project-2',
    name: 'E-commerce 플랫폼',
    description: '온라인 쇼핑몰',
    status: 'active',
    mainPrompt: '상품 목록, 장바구니, 결제 기능이 있는 e-commerce 사이트',
    aiProvider: 'openai',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-10T00:00:00Z',
  },
  {
    id: 'project-3',
    name: '완료된 프로젝트',
    description: '테스트용 완료 프로젝트',
    status: 'completed',
    mainPrompt: 'Simple task manager',
    aiProvider: 'google',
    createdAt: '2023-12-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// ==========================================
// Task Fixtures
// ==========================================

export const mockTasks: TaskFixture[] = [
  // Project 1 Tasks
  {
    id: 'task-1',
    projectId: 'project-1',
    title: '프로젝트 초기 설정',
    description: 'Vite + Vue 3 + TypeScript 환경 구성',
    status: 'done',
    priority: 'high',
    tags: ['setup', 'infrastructure'],
    dependencies: [],
    estimatedTime: 4,
    actualTime: 3,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'task-2',
    projectId: 'project-1',
    title: '사용자 인증 시스템',
    description: '이메일/비밀번호 로그인 및 소셜 로그인 구현',
    status: 'in_progress',
    priority: 'high',
    assignee: 'user-1',
    tags: ['auth', 'backend', 'security'],
    dependencies: ['task-1'],
    estimatedTime: 8,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
    dueDate: '2024-01-20T00:00:00Z',
  },
  {
    id: 'task-3',
    projectId: 'project-1',
    title: '피드 컴포넌트 개발',
    description: '무한 스크롤이 적용된 사진 피드 구현',
    status: 'todo',
    priority: 'medium',
    tags: ['frontend', 'ui'],
    dependencies: ['task-1', 'task-2'],
    estimatedTime: 12,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
  {
    id: 'task-4',
    projectId: 'project-1',
    title: '이미지 업로드 기능',
    description: '클라우드 스토리지 연동 이미지 업로드',
    status: 'todo',
    priority: 'high',
    tags: ['backend', 'storage'],
    dependencies: ['task-2'],
    estimatedTime: 6,
    createdAt: '2024-01-04T00:00:00Z',
    updatedAt: '2024-01-04T00:00:00Z',
  },
  {
    id: 'task-5',
    projectId: 'project-1',
    title: '댓글 시스템',
    description: '게시물 댓글 CRUD 기능',
    status: 'review',
    priority: 'medium',
    assignee: 'user-2',
    tags: ['backend', 'api'],
    dependencies: ['task-2', 'task-3'],
    estimatedTime: 4,
    actualTime: 5,
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-12T00:00:00Z',
  },
  // Project 2 Tasks
  {
    id: 'task-6',
    projectId: 'project-2',
    title: '상품 목록 페이지',
    description: '카테고리별 상품 목록 및 필터링',
    status: 'todo',
    priority: 'high',
    tags: ['frontend', 'ui'],
    dependencies: [],
    estimatedTime: 8,
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'task-7',
    projectId: 'project-2',
    title: '장바구니 기능',
    description: '장바구니 추가/삭제/수량 변경',
    status: 'todo',
    priority: 'high',
    tags: ['frontend', 'state'],
    dependencies: ['task-6'],
    estimatedTime: 6,
    createdAt: '2024-02-02T00:00:00Z',
    updatedAt: '2024-02-02T00:00:00Z',
  },
];

// ==========================================
// Kanban Column Fixtures
// ==========================================

export const kanbanColumns = [
  { id: 'todo', title: '할 일', status: 'todo' as const },
  { id: 'in_progress', title: '진행 중', status: 'in_progress' as const },
  { id: 'review', title: '검토', status: 'review' as const },
  { id: 'done', title: '완료', status: 'done' as const },
];

// ==========================================
// Task Execution Fixtures
// ==========================================

export const mockTaskExecution = {
  id: 'exec-1',
  taskId: 'task-2',
  status: 'running' as const,
  startedAt: '2024-01-15T10:00:00Z',
  logs: [
    { timestamp: '2024-01-15T10:00:00Z', level: 'info', message: '작업 시작' },
    { timestamp: '2024-01-15T10:00:05Z', level: 'info', message: '코드 생성 중...' },
    { timestamp: '2024-01-15T10:00:30Z', level: 'info', message: '테스트 실행 중...' },
  ],
  progress: 65,
};

export const mockCompletedExecution = {
  id: 'exec-2',
  taskId: 'task-1',
  status: 'completed' as const,
  startedAt: '2024-01-02T09:00:00Z',
  completedAt: '2024-01-02T09:30:00Z',
  result: {
    success: true,
    output: {
      filesCreated: ['vite.config.ts', 'tsconfig.json', 'package.json'],
      summary: '프로젝트 초기 설정이 완료되었습니다.',
    },
  },
  logs: [
    { timestamp: '2024-01-02T09:00:00Z', level: 'info', message: '작업 시작' },
    { timestamp: '2024-01-02T09:15:00Z', level: 'info', message: '설정 파일 생성 완료' },
    { timestamp: '2024-01-02T09:30:00Z', level: 'info', message: '작업 완료' },
  ],
  progress: 100,
};

// ==========================================
// Helper Functions
// ==========================================

export const getTasksByProject = (projectId: string): TaskFixture[] => {
  return mockTasks.filter((task) => task.projectId === projectId);
};

export const getTasksByStatus = (status: TaskFixture['status']): TaskFixture[] => {
  return mockTasks.filter((task) => task.status === status);
};

export const getTaskById = (taskId: string): TaskFixture | undefined => {
  return mockTasks.find((task) => task.id === taskId);
};

export const getProjectById = (projectId: string): ProjectFixture | undefined => {
  return mockProjects.find((project) => project.id === projectId);
};

export const createMockTask = (overrides: Partial<TaskFixture> = {}): TaskFixture => {
  const id = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return {
    id,
    projectId: 'project-1',
    title: 'New Task',
    description: 'Task description',
    status: 'todo',
    priority: 'medium',
    tags: [],
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
};

export const createMockProject = (overrides: Partial<ProjectFixture> = {}): ProjectFixture => {
  const id = `project-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return {
    id,
    name: 'New Project',
    description: 'Project description',
    status: 'active',
    mainPrompt: 'Create something amazing',
    aiProvider: 'anthropic',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
};
