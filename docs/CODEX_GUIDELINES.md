# Codex 에이전트 지침

> 본 문서는 Claude 지침(`docs/AI_SERVICES.md`)을 참고하여 Codex 기반 로컬 에이전트의 설정, 실행 흐름, 최적화/트러블슈팅 팁을 정리한 자료입니다.

## 1. 개요

- **Codex CLI**는 OpenAI가 제공하는 GPT-4 기반 AI 코딩 에이전트로, 자연어 명령을 입력하면 코드 생성·수정·리뷰를 수행합니다.
- 기존 `claude-code`와 유사하게 로컬 터미널에서 `codex` 실행 파일을 띄워 세션 단위로 유지하며, 이 앱에서는 `codex` 명령어를 통해 `LocalAgentSession`으로 연결합니다.
- `AIServiceConfig`에는 `codex-latest`(기본)과 `codex-standard` 모델이 정의되어 있으며, 코드 생성/리팩터링/설계 문서화 등 코드 중심 작업에 적합합니다.

## 2. 설치 및 인증

- 설치: `npm install -g @openai/codex` 또는 `pnpm add -g @openai/codex`
- macOS/Linux에서는 npm 글로벌 bin 경로가 `PATH`에 포함되어야 하며, 클라이언트는 `LocalAgentSession`이 `PATH`를 확장하여 일반적인 nvm/npm 디렉터리를 자동으로 넣습니다.
- API 키: `.env`에 `OPENAI_API_KEY=sk-...`를 추가해야 CLI가 OpenAI 서버에 인증 요청을 보낼 수 있습니다. CLI 자체가 `process.env.OPENAI_API_KEY`를 참고하므로 Electron 환경에서도 동일한 키를 활용합니다.
- CLI 호출 예시: `codex --json --session <SESSION_ID>` (앱 내부에서 `LocalAgentSession#getStartArgs()`가 이를 구성함).

## 3. 세션 구성 & 메시지 포맷

- `electron/main/services/local-agent-session.ts`의 `LocalAgentSession`은 에이전트별로 세션을 구분하며 `agentType`이 `'codex'`일 때 다음과 같은 설정이 적용됩니다.
  - 시작 인자: `['--json', '--session', this.id]`
  - 입력 포맷: `{ prompt: 메시지, ...options }` 형태로 JSON 문자열을 stdin에 전달
  - 출력 포맷: stdout 스트림에서 누적되는 텍스트를 JSON으로 처리한 후 `AgentResponse` 객체로 정리
- 타임아웃과 상태 관리는 `SendMessageOptions.timeout`(기본 5분), `'running'` 상태 플래그, `responseTimeout`으로 관리하므로, 긴 요청은 응답을 분할하거나 `chunkText`로 분할하여 보냅니다.

## 4. 사용 예제

```typescript
import { LocalAgentSession } from '@/electron/main/services/local-agent-session';

const session = new LocalAgentSession('codex', process.cwd());
await session.start();

const response = await session.sendMessage('이 프로젝트에 맞는 테스트 러너 설정을 작성해줘', {
  model: 'codex-latest',
  tools: ['shell', 'git'],
  timeout: 120000,
});

console.log('Codex 응답:', response.content);
```

- 이벤트 기반 처리를 추가하려면 `session.on('data', handler)` 또는 `session.on('error', handler)`를 구독하여 실시간 로그와 에러를 모니터링할 수 있습니다.

## 5. 모델과 비용

- `codex-latest`: 입력 4.0$/1M, 출력 16$/1M (기본 모델)
- `codex-standard`: 입력 1.5$/1M, 출력 6$/1M (경량, 빠른 응답)
- 비용 추정은 `AIServiceConfig.estimateCost()`를 통해 토큰 수를 기반으로 구현되어 있으므로, 로컬 에이전트도 동일한 가격 정책을 적용하여 대시보드에 보여줄 수 있습니다.

## 6. 최적화 팁

1. **스트리밍/청크 처리**: 긴 프롬프트는 `chunkText()`로 나누고 `messageCount`가 많아질수록 `LocalAgentSession`이 평균 5분 타임아웃을 넘지 않도록 조정합니다.
2. **도구 허용 목록**: `SendMessageOptions.tools`를 통해 `shell`, `git`처럼 명시적 도구를 전달하면 CLI가 권한을 검증한 후 사용합니다.
3. **모델 선택**: 간단한 수정에는 `codex-standard`, 고급 리뷰에는 `codex-latest`를 사용하여 균형을 맞춥니다.
4. **캐시 활용**: 동일한 시스템 프롬프트/컨텍스트는 다시 요청하지 않고 애플리케이션 레벨에서 캐싱하는 것이 비용과 지연을 줄입니다.
5. **로그 레벨**: `LocalAgentSession`이 출력하는 JSON을 콘솔에 기록하여 로그 기반 트러블슈팅을 유지합니다.

## 7. 장애 대응

- **`command not found: codex`**: 글로벌 설치 (`npm install -g @openai/codex`) 후에도 macOS/Linux에서는 `PATH`가 갱신되어야 합니다. 앱은 `getEnhancedPath()`로 여러 경로를 자동 추가하지만, 터미널에서 `which codex`로 위치를 확인해 주세요.
- **`OPENAI_API_KEY` 누락**: `.env` 또는 시스템 환경에 API 키가 없으면 CLI가 인증 실패합니다. `OPENAI_API_KEY`를 설정하고 앱을 재시작하세요.
- **세션 타임아웃**: 긴 작업은 `SendMessageOptions.timeout`을 늘리거나 입력을 쪼개서 연속 메시지를 보내고, `responseBuffer`가 JSON 한 덩어리를 넘어섰을 때 `tryParseResponse()` 로직이 정상 작동하는지 확인하세요.
- **JSON 파싱 실패**: stdout에 로그가 섞일 경우 필터링이 필요하므로, CLI가 출력하는 모든 줄이 JSON 형식이어야 하고, 에러 메시지는 stderr로만 보내도록 설정해야 합니다.

## 8. 향후 개선

- [ ] CLI(코덱) 설치 상태를 더 정교하게 감지 (현재 `LocalAgentsTab`에서 `checkInstalled`)
- [ ] 명령줄 인자(`--json` 외) 확장 및 권한 설정 옵션 노출
- [ ] 기본 프롬프트 템플릿을 저장해 재사용하는 Context Cache 기능
- [ ] 다른 모델/로컬 에이전트(예: ChatGPT CLI)로 확장

**Last Updated**: 2025-11-25
