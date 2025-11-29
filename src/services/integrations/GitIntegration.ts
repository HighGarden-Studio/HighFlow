/**
 * Git Integration Service
 *
 * Provides integration with GitHub, GitLab, and Bitbucket
 * for repository management, commits, branches, and pull requests.
 */

// ========================================
// Types
// ========================================

export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

export interface GitCredentials {
  provider: GitProvider;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: number;
}

export interface Repository {
  id: string;
  provider: GitProvider;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  owner: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Commit {
  sha: string;
  message: string;
  shortMessage: string;
  author: {
    name: string;
    email: string;
    date: Date;
  };
  committer: {
    name: string;
    email: string;
    date: Date;
  };
  url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: CommitFile[];
  linkedTaskIds?: string[];
}

export interface CommitFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
  url?: string;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  sourceBranch: string;
  targetBranch: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
  closedAt?: Date;
  linkedTaskIds?: string[];
  reviewers?: Array<{
    id: string;
    name: string;
    state: 'pending' | 'approved' | 'changes_requested';
  }>;
  labels?: string[];
  draft?: boolean;
}

export interface CreatePullRequestParams {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  draft?: boolean;
  labels?: string[];
  reviewers?: string[];
}

export interface TaskCommitLink {
  taskId: string;
  commitSha: string;
  provider: GitProvider;
  repositoryId: string;
  linkedAt: Date;
}

export interface TaskPRLink {
  taskId: string;
  prNumber: number;
  provider: GitProvider;
  repositoryId: string;
  linkedAt: Date;
}

// ========================================
// Git Integration Service
// ========================================

export class GitIntegration {
  private credentials: Map<GitProvider, GitCredentials> = new Map();
  private repositories: Map<string, Repository> = new Map();
  private taskCommitLinks: Map<string, TaskCommitLink[]> = new Map();
  private taskPRLinks: Map<string, TaskPRLink[]> = new Map();

  // API base URLs
  private readonly apiUrls: Record<GitProvider, string> = {
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com/api/v4',
    bitbucket: 'https://api.bitbucket.org/2.0',
  };

  // ========================================
  // Authentication
  // ========================================

  /**
   * Set credentials for a provider
   */
  setCredentials(credentials: GitCredentials): void {
    this.credentials.set(credentials.provider, credentials);
  }

  /**
   * Get credentials for a provider
   */
  getCredentials(provider: GitProvider): GitCredentials | undefined {
    return this.credentials.get(provider);
  }

  /**
   * Check if authenticated with a provider
   */
  isAuthenticated(provider: GitProvider): boolean {
    const creds = this.credentials.get(provider);
    if (!creds) return false;

    // Check if token is expired
    if (creds.expiresAt && Date.now() >= creds.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Disconnect a provider
   */
  disconnect(provider: GitProvider): void {
    this.credentials.delete(provider);

    // Remove repositories for this provider
    for (const [key, repo] of this.repositories.entries()) {
      if (repo.provider === provider) {
        this.repositories.delete(key);
      }
    }
  }

  // ========================================
  // Repository Management
  // ========================================

  /**
   * Connect to a repository
   */
  async connectRepository(
    provider: GitProvider,
    repoUrl: string,
    credentials: GitCredentials
  ): Promise<Repository> {
    this.setCredentials(credentials);

    const repoInfo = this.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      throw new Error(`Invalid repository URL: ${repoUrl}`);
    }

    const repository = await this.fetchRepository(provider, repoInfo.owner, repoInfo.repo);

    const repoKey = `${provider}:${repository.fullName}`;
    this.repositories.set(repoKey, repository);

    return repository;
  }

  /**
   * Get connected repositories
   */
  getConnectedRepositories(): Repository[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Get repository by key
   */
  getRepository(provider: GitProvider, fullName: string): Repository | undefined {
    return this.repositories.get(`${provider}:${fullName}`);
  }

  /**
   * Fetch repository information
   */
  private async fetchRepository(
    provider: GitProvider,
    owner: string,
    repo: string
  ): Promise<Repository> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubRepository(owner, repo);
      case 'gitlab':
        return this.fetchGitLabRepository(owner, repo);
      case 'bitbucket':
        return this.fetchBitbucketRepository(owner, repo);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ========================================
  // Commits
  // ========================================

  /**
   * Get a single commit
   */
  async getCommit(provider: GitProvider, fullName: string, sha: string): Promise<Commit> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubCommit(fullName, sha);
      case 'gitlab':
        return this.fetchGitLabCommit(fullName, sha);
      case 'bitbucket':
        return this.fetchBitbucketCommit(fullName, sha);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get commits from a branch
   */
  async getCommits(
    provider: GitProvider,
    fullName: string,
    branch: string,
    since?: Date,
    limit = 30
  ): Promise<Commit[]> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubCommits(fullName, branch, since, limit);
      case 'gitlab':
        return this.fetchGitLabCommits(fullName, branch, since, limit);
      case 'bitbucket':
        return this.fetchBitbucketCommits(fullName, branch, since, limit);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Link a commit to a task
   */
  async linkCommitToTask(
    taskId: string,
    commitSha: string,
    provider: GitProvider,
    repositoryFullName: string
  ): Promise<void> {
    const link: TaskCommitLink = {
      taskId,
      commitSha,
      provider,
      repositoryId: repositoryFullName,
      linkedAt: new Date(),
    };

    const existing = this.taskCommitLinks.get(taskId) || [];
    existing.push(link);
    this.taskCommitLinks.set(taskId, existing);
  }

  /**
   * Get commits linked to a task
   */
  getLinkedCommits(taskId: string): TaskCommitLink[] {
    return this.taskCommitLinks.get(taskId) || [];
  }

  /**
   * Parse task ID from commit message
   */
  parseTaskIdFromCommit(message: string): string | null {
    // Common patterns:
    // - #123
    // - TASK-123
    // - [123]
    // - task/123
    const patterns = [
      /#(\d+)/,                    // #123
      /TASK-(\d+)/i,               // TASK-123
      /\[(\d+)\]/,                 // [123]
      /task\/(\d+)/i,              // task/123
      /fixes?\s*#(\d+)/i,          // fixes #123
      /closes?\s*#(\d+)/i,         // closes #123
      /resolves?\s*#(\d+)/i,       // resolves #123
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  // ========================================
  // Branches
  // ========================================

  /**
   * Get branches
   */
  async getBranches(provider: GitProvider, fullName: string): Promise<Branch[]> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubBranches(fullName);
      case 'gitlab':
        return this.fetchGitLabBranches(fullName);
      case 'bitbucket':
        return this.fetchBitbucketBranches(fullName);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Create a branch for a task
   */
  async createBranch(
    provider: GitProvider,
    fullName: string,
    taskId: string,
    baseBranch: string,
    branchPrefix = 'task'
  ): Promise<Branch> {
    const branchName = `${branchPrefix}/${taskId}`;

    switch (provider) {
      case 'github':
        return this.createGitHubBranch(fullName, branchName, baseBranch);
      case 'gitlab':
        return this.createGitLabBranch(fullName, branchName, baseBranch);
      case 'bitbucket':
        return this.createBitbucketBranch(fullName, branchName, baseBranch);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ========================================
  // Pull Requests
  // ========================================

  /**
   * Create a pull request
   */
  async createPullRequest(
    provider: GitProvider,
    fullName: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    switch (provider) {
      case 'github':
        return this.createGitHubPR(fullName, params);
      case 'gitlab':
        return this.createGitLabMR(fullName, params);
      case 'bitbucket':
        return this.createBitbucketPR(fullName, params);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get pull request
   */
  async getPullRequest(
    provider: GitProvider,
    fullName: string,
    prNumber: number
  ): Promise<PullRequest> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubPR(fullName, prNumber);
      case 'gitlab':
        return this.fetchGitLabMR(fullName, prNumber);
      case 'bitbucket':
        return this.fetchBitbucketPR(fullName, prNumber);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get pull requests for a repository
   */
  async getPullRequests(
    provider: GitProvider,
    fullName: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<PullRequest[]> {
    switch (provider) {
      case 'github':
        return this.fetchGitHubPRs(fullName, state);
      case 'gitlab':
        return this.fetchGitLabMRs(fullName, state);
      case 'bitbucket':
        return this.fetchBitbucketPRs(fullName, state);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Link a PR to a task
   */
  async linkPRToTask(
    taskId: string,
    prNumber: number,
    provider: GitProvider,
    repositoryFullName: string
  ): Promise<void> {
    const link: TaskPRLink = {
      taskId,
      prNumber,
      provider,
      repositoryId: repositoryFullName,
      linkedAt: new Date(),
    };

    const existing = this.taskPRLinks.get(taskId) || [];
    existing.push(link);
    this.taskPRLinks.set(taskId, existing);
  }

  /**
   * Get PRs linked to a task
   */
  getLinkedPRs(taskId: string): TaskPRLink[] {
    return this.taskPRLinks.get(taskId) || [];
  }

  // ========================================
  // GitHub API Implementation
  // ========================================

  private async fetchGitHubRepository(owner: string, repo: string): Promise<Repository> {
    const data = await this.githubRequest(`/repos/${owner}/${repo}`);
    const ownerData = data.owner as Record<string, unknown>;

    return {
      id: String(data.id),
      provider: 'github',
      name: data.name as string,
      fullName: data.full_name as string,
      description: data.description as string | undefined,
      url: data.html_url as string,
      cloneUrl: data.clone_url as string,
      sshUrl: data.ssh_url as string,
      defaultBranch: data.default_branch as string,
      isPrivate: data.private as boolean,
      owner: {
        id: String(ownerData.id),
        name: ownerData.login as string,
        avatarUrl: ownerData.avatar_url as string,
      },
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  private async fetchGitHubCommit(fullName: string, sha: string): Promise<Commit> {
    const data = await this.githubRequest(`/repos/${fullName}/commits/${sha}`);
    const commit = data.commit as Record<string, unknown>;
    const author = commit.author as Record<string, unknown>;
    const committer = commit.committer as Record<string, unknown>;
    const message = commit.message as string;
    const files = data.files as Array<Record<string, unknown>> | undefined;
    const stats = data.stats as { additions: number; deletions: number; total: number } | undefined;

    return {
      sha: data.sha as string,
      message,
      shortMessage: message.split('\n')[0] ?? message,
      author: {
        name: author.name as string,
        email: author.email as string,
        date: new Date(author.date as string),
      },
      committer: {
        name: committer.name as string,
        email: committer.email as string,
        date: new Date(committer.date as string),
      },
      url: data.html_url as string,
      stats,
      files: files?.map((f: Record<string, unknown>) => ({
        filename: f.filename as string,
        status: f.status as 'added' | 'removed' | 'modified' | 'renamed',
        additions: f.additions as number,
        deletions: f.deletions as number,
        patch: f.patch as string | undefined,
      })),
      linkedTaskIds: this.parseTaskIdFromCommit(message)
        ? [this.parseTaskIdFromCommit(message)!]
        : [],
    };
  }

  private async fetchGitHubCommits(
    fullName: string,
    branch: string,
    since?: Date,
    limit = 30
  ): Promise<Commit[]> {
    const params = new URLSearchParams({
      sha: branch,
      per_page: limit.toString(),
    });

    if (since) {
      params.append('since', since.toISOString());
    }

    const data = await this.githubRequest(`/repos/${fullName}/commits?${params}`);
    const dataArray = data as unknown as Array<Record<string, unknown>>;

    return dataArray.map((item: Record<string, unknown>) => {
      const commit = item.commit as Record<string, unknown>;
      const author = commit.author as Record<string, unknown>;
      const committer = commit.committer as Record<string, unknown>;
      const message = commit.message as string;

      return {
        sha: item.sha as string,
        message,
        shortMessage: message.split('\n')[0] ?? message,
        author: {
          name: author.name as string,
          email: author.email as string,
          date: new Date(author.date as string),
        },
        committer: {
          name: committer.name as string,
          email: committer.email as string,
          date: new Date(committer.date as string),
        },
        url: item.html_url as string,
        linkedTaskIds: this.parseTaskIdFromCommit(message)
          ? [this.parseTaskIdFromCommit(message)!]
          : [],
      };
    });
  }

  private async fetchGitHubBranches(fullName: string): Promise<Branch[]> {
    const data = await this.githubRequest(`/repos/${fullName}/branches`);
    const dataArray = data as unknown as Array<Record<string, unknown>>;

    return dataArray.map((b: Record<string, unknown>) => ({
      name: b.name as string,
      sha: (b.commit as Record<string, unknown>).sha as string,
      protected: b.protected as boolean,
    }));
  }

  private async createGitHubBranch(
    fullName: string,
    branchName: string,
    baseBranch: string
  ): Promise<Branch> {
    // Get the SHA of the base branch
    const baseRef = await this.githubRequest(`/repos/${fullName}/git/refs/heads/${baseBranch}`);
    const baseRefObj = baseRef.object as Record<string, unknown>;
    const baseSha = baseRefObj.sha as string;

    // Create the new branch
    const data = await this.githubRequest(`/repos/${fullName}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });
    const dataObj = data.object as Record<string, unknown>;

    return {
      name: branchName,
      sha: dataObj.sha as string,
      protected: false,
    };
  }

  private async createGitHubPR(
    fullName: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    const data = await this.githubRequest(`/repos/${fullName}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        body: params.description,
        head: params.sourceBranch,
        base: params.targetBranch,
        draft: params.draft,
      }),
    });

    // Add labels if provided
    if (params.labels && params.labels.length > 0) {
      await this.githubRequest(`/repos/${fullName}/issues/${data.number}/labels`, {
        method: 'POST',
        body: JSON.stringify({ labels: params.labels }),
      });
    }

    // Request reviewers if provided
    if (params.reviewers && params.reviewers.length > 0) {
      await this.githubRequest(`/repos/${fullName}/pulls/${data.number}/requested_reviewers`, {
        method: 'POST',
        body: JSON.stringify({ reviewers: params.reviewers }),
      });
    }

    return this.mapGitHubPR(data);
  }

  private async fetchGitHubPR(fullName: string, prNumber: number): Promise<PullRequest> {
    const data = await this.githubRequest(`/repos/${fullName}/pulls/${prNumber}`);
    return this.mapGitHubPR(data);
  }

  private async fetchGitHubPRs(
    fullName: string,
    state: 'open' | 'closed' | 'all'
  ): Promise<PullRequest[]> {
    const data = await this.githubRequest(`/repos/${fullName}/pulls?state=${state}`);
    const dataArray = data as unknown as Array<Record<string, unknown>>;
    return dataArray.map((pr: Record<string, unknown>) => this.mapGitHubPR(pr));
  }

  private mapGitHubPR(data: Record<string, unknown>): PullRequest {
    const user = data.user as Record<string, unknown>;
    const head = data.head as Record<string, unknown>;
    const base = data.base as Record<string, unknown>;

    return {
      id: data.id as number,
      number: data.number as number,
      title: data.title as string,
      description: (data.body as string) || '',
      state: data.merged_at ? 'merged' : (data.state as 'open' | 'closed'),
      url: data.html_url as string,
      sourceBranch: head.ref as string,
      targetBranch: base.ref as string,
      author: {
        id: (user.id as number).toString(),
        name: user.login as string,
        avatarUrl: user.avatar_url as string,
      },
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      mergedAt: data.merged_at ? new Date(data.merged_at as string) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at as string) : undefined,
      draft: data.draft as boolean,
      linkedTaskIds: this.parseTaskIdFromCommit(data.title as string)
        ? [this.parseTaskIdFromCommit(data.title as string)!]
        : [],
    };
  }

  private async githubRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Record<string, unknown>> {
    const creds = this.credentials.get('github');
    if (!creds) {
      throw new Error('Not authenticated with GitHub');
    }

    const response = await fetch(`${this.apiUrls.github}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  // ========================================
  // GitLab API Implementation (Stubs)
  // ========================================

  private async fetchGitLabRepository(owner: string, repo: string): Promise<Repository> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const data = await this.gitlabRequest(`/projects/${projectPath}`);
    const namespace = data.namespace as Record<string, unknown> | undefined;

    return {
      id: String(data.id),
      provider: 'gitlab',
      name: data.name as string,
      fullName: data.path_with_namespace as string,
      description: data.description as string | undefined,
      url: data.web_url as string,
      cloneUrl: data.http_url_to_repo as string,
      sshUrl: data.ssh_url_to_repo as string,
      defaultBranch: data.default_branch as string,
      isPrivate: (data.visibility as string) === 'private',
      owner: {
        id: namespace?.id ? String(namespace.id) : '',
        name: (namespace?.name as string) ?? '',
        avatarUrl: namespace?.avatar_url as string | undefined,
      },
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.last_activity_at as string),
    };
  }

  private async fetchGitLabCommit(fullName: string, sha: string): Promise<Commit> {
    const projectPath = encodeURIComponent(fullName);
    const data = await this.gitlabRequest(`/projects/${projectPath}/repository/commits/${sha}`);
    const message = data.message as string;
    const statsData = data.stats as { additions?: number; deletions?: number; total?: number } | undefined;

    return {
      sha: data.id as string,
      message,
      shortMessage: (data.title as string) ?? message.split('\n')[0] ?? message,
      author: {
        name: data.author_name as string,
        email: data.author_email as string,
        date: new Date(data.authored_date as string),
      },
      committer: {
        name: data.committer_name as string,
        email: data.committer_email as string,
        date: new Date(data.committed_date as string),
      },
      url: data.web_url as string,
      stats: statsData && statsData.additions !== undefined
        ? {
            additions: statsData.additions ?? 0,
            deletions: statsData.deletions ?? 0,
            total: statsData.total ?? 0,
          }
        : undefined,
      linkedTaskIds: this.parseTaskIdFromCommit(message)
        ? [this.parseTaskIdFromCommit(message)!]
        : [],
    };
  }

  private async fetchGitLabCommits(
    fullName: string,
    branch: string,
    since?: Date,
    limit = 30
  ): Promise<Commit[]> {
    const projectPath = encodeURIComponent(fullName);
    const params = new URLSearchParams({
      ref_name: branch,
      per_page: limit.toString(),
    });

    if (since) {
      params.append('since', since.toISOString());
    }

    const data = await this.gitlabRequest(
      `/projects/${projectPath}/repository/commits?${params}`
    );
    const dataArray = data as unknown as Array<Record<string, unknown>>;

    return dataArray.map((item: Record<string, unknown>) => {
      const message = item.message as string;
      return {
        sha: item.id as string,
        message,
        shortMessage: (item.title as string) ?? message.split('\n')[0] ?? message,
        author: {
          name: item.author_name as string,
          email: item.author_email as string,
          date: new Date(item.authored_date as string),
        },
        committer: {
          name: item.committer_name as string,
          email: item.committer_email as string,
          date: new Date(item.committed_date as string),
        },
        url: item.web_url as string,
        linkedTaskIds: this.parseTaskIdFromCommit(message)
          ? [this.parseTaskIdFromCommit(message)!]
          : [],
      };
    });
  }

  private async fetchGitLabBranches(fullName: string): Promise<Branch[]> {
    const projectPath = encodeURIComponent(fullName);
    const data = await this.gitlabRequest(`/projects/${projectPath}/repository/branches`);
    const dataArray = data as unknown as Array<Record<string, unknown>>;

    return dataArray.map((b: Record<string, unknown>) => ({
      name: b.name as string,
      sha: (b.commit as Record<string, unknown>).id as string,
      protected: b.protected as boolean,
    }));
  }

  private async createGitLabBranch(
    fullName: string,
    branchName: string,
    baseBranch: string
  ): Promise<Branch> {
    const projectPath = encodeURIComponent(fullName);
    const data = await this.gitlabRequest(`/projects/${projectPath}/repository/branches`, {
      method: 'POST',
      body: JSON.stringify({
        branch: branchName,
        ref: baseBranch,
      }),
    });

    return {
      name: data.name as string,
      sha: (data.commit as Record<string, unknown>).id as string,
      protected: data.protected as boolean,
    };
  }

  private async createGitLabMR(
    fullName: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    const projectPath = encodeURIComponent(fullName);
    const data = await this.gitlabRequest(`/projects/${projectPath}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        source_branch: params.sourceBranch,
        target_branch: params.targetBranch,
        labels: params.labels?.join(','),
        reviewer_ids: params.reviewers,
      }),
    });

    return this.mapGitLabMR(data);
  }

  private async fetchGitLabMR(fullName: string, mrNumber: number): Promise<PullRequest> {
    const projectPath = encodeURIComponent(fullName);
    const data = await this.gitlabRequest(`/projects/${projectPath}/merge_requests/${mrNumber}`);
    return this.mapGitLabMR(data);
  }

  private async fetchGitLabMRs(
    fullName: string,
    state: 'open' | 'closed' | 'all'
  ): Promise<PullRequest[]> {
    const projectPath = encodeURIComponent(fullName);
    const stateParam = state === 'open' ? 'opened' : state === 'all' ? 'all' : 'closed';
    const data = await this.gitlabRequest(
      `/projects/${projectPath}/merge_requests?state=${stateParam}`
    );
    const dataArray = data as unknown as Array<Record<string, unknown>>;
    return dataArray.map((mr: Record<string, unknown>) => this.mapGitLabMR(mr));
  }

  private mapGitLabMR(data: Record<string, unknown>): PullRequest {
    const author = data.author as Record<string, unknown>;

    return {
      id: data.id as number,
      number: data.iid as number,
      title: data.title as string,
      description: (data.description as string) || '',
      state: data.merged_at ? 'merged' : (data.state as string) === 'opened' ? 'open' : 'closed',
      url: data.web_url as string,
      sourceBranch: data.source_branch as string,
      targetBranch: data.target_branch as string,
      author: {
        id: (author.id as number).toString(),
        name: author.username as string,
        avatarUrl: author.avatar_url as string,
      },
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      mergedAt: data.merged_at ? new Date(data.merged_at as string) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at as string) : undefined,
      draft: data.draft as boolean,
      labels: data.labels as string[],
      linkedTaskIds: this.parseTaskIdFromCommit(data.title as string)
        ? [this.parseTaskIdFromCommit(data.title as string)!]
        : [],
    };
  }

  private async gitlabRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Record<string, unknown>> {
    const creds = this.credentials.get('gitlab');
    if (!creds) {
      throw new Error('Not authenticated with GitLab');
    }

    const response = await fetch(`${this.apiUrls.gitlab}${endpoint}`, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': creds.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitLab API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  // ========================================
  // Bitbucket API Implementation (Stubs)
  // ========================================

  private async fetchBitbucketRepository(owner: string, repo: string): Promise<Repository> {
    const data = await this.bitbucketRequest(`/repositories/${owner}/${repo}`);
    const links = data.links as Record<string, unknown>;
    const cloneLinks = (links?.clone ?? []) as Array<Record<string, unknown>>;
    const mainbranch = data.mainbranch as Record<string, unknown> | undefined;
    const ownerData = data.owner as Record<string, unknown>;
    const ownerLinks = ownerData?.links as Record<string, unknown> | undefined;
    const htmlLink = links?.html as { href?: string } | undefined;

    return {
      id: data.uuid as string,
      provider: 'bitbucket',
      name: data.name as string,
      fullName: data.full_name as string,
      description: data.description as string | undefined,
      url: htmlLink?.href ?? '',
      cloneUrl: cloneLinks.find((c) => c.name === 'https')?.href as string ?? '',
      sshUrl: cloneLinks.find((c) => c.name === 'ssh')?.href as string ?? '',
      defaultBranch: (mainbranch?.name as string) ?? 'main',
      isPrivate: data.is_private as boolean,
      owner: {
        id: ownerData?.uuid as string ?? '',
        name: ownerData?.display_name as string ?? '',
        avatarUrl: (ownerLinks?.avatar as { href?: string })?.href,
      },
      createdAt: new Date(data.created_on as string),
      updatedAt: new Date(data.updated_on as string),
    };
  }

  private async fetchBitbucketCommit(fullName: string, sha: string): Promise<Commit> {
    const data = await this.bitbucketRequest(`/repositories/${fullName}/commit/${sha}`);
    const author = data.author as Record<string, unknown>;
    const message = data.message as string;
    const authorRaw = (author?.raw as string) ?? '';
    const links = data.links as Record<string, unknown>;
    const htmlLink = links?.html as Record<string, unknown>;
    const emailMatch = authorRaw.match(/<(.+)>/);

    return {
      sha: data.hash as string,
      message,
      shortMessage: message.split('\n')[0] ?? message,
      author: {
        name: authorRaw.split('<')[0]?.trim() ?? '',
        email: emailMatch?.[1] ?? '',
        date: new Date(data.date as string),
      },
      committer: {
        name: authorRaw.split('<')[0]?.trim() ?? '',
        email: emailMatch?.[1] ?? '',
        date: new Date(data.date as string),
      },
      url: (htmlLink?.href as string) ?? '',
      linkedTaskIds: this.parseTaskIdFromCommit(message)
        ? [this.parseTaskIdFromCommit(message)!]
        : [],
    };
  }

  private async fetchBitbucketCommits(
    fullName: string,
    branch: string,
    _since?: Date,
    limit = 30
  ): Promise<Commit[]> {
    const data = await this.bitbucketRequest(
      `/repositories/${fullName}/commits/${branch}?pagelen=${limit}`
    );
    const values = (data.values ?? []) as Array<Record<string, unknown>>;

    return values.map((item) => {
      const author = item.author as Record<string, unknown>;
      const message = item.message as string;
      const authorRaw = (author?.raw as string) ?? '';
      const links = item.links as Record<string, unknown>;
      const htmlLink = links?.html as Record<string, unknown>;
      const emailMatch = authorRaw.match(/<(.+)>/);

      return {
        sha: item.hash as string,
        message,
        shortMessage: message.split('\n')[0] ?? message,
        author: {
          name: authorRaw.split('<')[0]?.trim() ?? '',
          email: emailMatch?.[1] ?? '',
          date: new Date(item.date as string),
        },
        committer: {
          name: authorRaw.split('<')[0]?.trim() ?? '',
          email: emailMatch?.[1] ?? '',
          date: new Date(item.date as string),
        },
        url: (htmlLink?.href as string) ?? '',
        linkedTaskIds: this.parseTaskIdFromCommit(message)
          ? [this.parseTaskIdFromCommit(message)!]
          : [],
      };
    });
  }

  private async fetchBitbucketBranches(fullName: string): Promise<Branch[]> {
    const data = await this.bitbucketRequest(`/repositories/${fullName}/refs/branches`);

    return (data.values as Array<Record<string, unknown>>).map((b) => ({
      name: b.name as string,
      sha: (b.target as Record<string, unknown>).hash as string,
      protected: false,
    }));
  }

  private async createBitbucketBranch(
    fullName: string,
    branchName: string,
    baseBranch: string
  ): Promise<Branch> {
    // Get the SHA of the base branch
    const baseData = await this.bitbucketRequest(
      `/repositories/${fullName}/refs/branches/${baseBranch}`
    );
    const baseSha = (baseData.target as Record<string, unknown>).hash as string;

    // Create the new branch
    const data = await this.bitbucketRequest(`/repositories/${fullName}/refs/branches`, {
      method: 'POST',
      body: JSON.stringify({
        name: branchName,
        target: { hash: baseSha },
      }),
    });

    return {
      name: data.name as string,
      sha: (data.target as Record<string, unknown>).hash as string,
      protected: false,
    };
  }

  private async createBitbucketPR(
    fullName: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    const data = await this.bitbucketRequest(`/repositories/${fullName}/pullrequests`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        source: { branch: { name: params.sourceBranch } },
        destination: { branch: { name: params.targetBranch } },
        reviewers: params.reviewers?.map((r) => ({ uuid: r })),
      }),
    });

    return this.mapBitbucketPR(data);
  }

  private async fetchBitbucketPR(fullName: string, prNumber: number): Promise<PullRequest> {
    const data = await this.bitbucketRequest(`/repositories/${fullName}/pullrequests/${prNumber}`);
    return this.mapBitbucketPR(data);
  }

  private async fetchBitbucketPRs(
    fullName: string,
    state: 'open' | 'closed' | 'all'
  ): Promise<PullRequest[]> {
    const stateParam = state === 'all' ? '' : `&state=${state.toUpperCase()}`;
    const data = await this.bitbucketRequest(
      `/repositories/${fullName}/pullrequests?${stateParam}`
    );
    return (data.values as Array<Record<string, unknown>>).map((pr) => this.mapBitbucketPR(pr));
  }

  private mapBitbucketPR(data: Record<string, unknown>): PullRequest {
    const author = data.author as Record<string, unknown>;
    const source = data.source as Record<string, unknown>;
    const destination = data.destination as Record<string, unknown>;
    const links = data.links as Record<string, unknown>;
    const htmlLink = links?.html as Record<string, unknown>;
    const authorLinks = author?.links as Record<string, unknown>;
    const authorAvatar = authorLinks?.avatar as Record<string, unknown>;
    const title = data.title as string;

    return {
      id: data.id as number,
      number: data.id as number,
      title,
      description: (data.description as string) || '',
      state: ((data.state as string) === 'MERGED' ? 'merged' : (data.state as string) === 'OPEN' ? 'open' : 'closed'),
      url: (htmlLink?.href as string) ?? '',
      sourceBranch: (source?.branch as Record<string, unknown>)?.name as string ?? '',
      targetBranch: (destination?.branch as Record<string, unknown>)?.name as string ?? '',
      author: {
        id: (author?.uuid as string) ?? '',
        name: (author?.display_name as string) ?? '',
        avatarUrl: (authorAvatar?.href as string) ?? undefined,
      },
      createdAt: new Date(data.created_on as string),
      updatedAt: new Date(data.updated_on as string),
      linkedTaskIds: this.parseTaskIdFromCommit(title)
        ? [this.parseTaskIdFromCommit(title)!]
        : [],
    };
  }

  private async bitbucketRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Record<string, unknown>> {
    const creds = this.credentials.get('bitbucket');
    if (!creds) {
      throw new Error('Not authenticated with Bitbucket');
    }

    const response = await fetch(`${this.apiUrls.bitbucket}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Bitbucket API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // ========================================
  // Utility Methods
  // ========================================

  private parseRepoUrl(url: string): { owner: string; repo: string } | null {
    // Match various Git URL formats
    const patterns = [
      /github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
      /gitlab\.com[/:]([\w-]+(?:\/[\w-]+)*)\/([\w.-]+?)(?:\.git)?$/,
      /bitbucket\.org[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1] && match[2]) {
        return { owner: match[1], repo: match[2] };
      }
    }

    return null;
  }
}

// ========================================
// Singleton Instance
// ========================================

let gitIntegrationInstance: GitIntegration | null = null;

export function initializeGitIntegration(): GitIntegration {
  if (!gitIntegrationInstance) {
    gitIntegrationInstance = new GitIntegration();
  }
  return gitIntegrationInstance;
}

export function getGitIntegration(): GitIntegration | null {
  return gitIntegrationInstance;
}

export default GitIntegration;
