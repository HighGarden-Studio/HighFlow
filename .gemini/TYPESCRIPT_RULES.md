# 🚨 CRITICAL: TypeScript & Code Quality Rules for Gemini

> **이 규칙은 MANDATORY입니다. 예외 없이 모든 코드 변경에 적용됩니다.**

## ⚠️ 절대 규칙 - 절대 위반 금지

### 1. **금지된 타입 - 절대 사용 금지**

```typescript
// ❌ 절대 사용 금지:
any; // → unknown 또는 구체적 타입 사용
{
} // → Record<string, unknown> 사용
Function; // → (args: Type) => ReturnType 사용
Object; // → Record<string, unknown> 또는 interface 사용
```

### 2. **필수 검증 - 모든 커밋 전**

```bash
# 🔴 필수: 커밋 전 반드시 실행
pnpm type-check    # 0 errors 필수
pnpm lint          # 0 errors 필수 (warnings는 허용)

# ✅ 둘 다 통과해야만 커밋 가능
git add -A && git commit -m "..."
```

### 3. **올바른 타입 사용법**

```typescript
// ✅ 올바른 사용:
unknown                              // 타입을 모를 때
Record<string, unknown>              // 객체 타입
(param: Type) => ReturnType         // 함수 타입
interface MyType { ... }            // 구조화된 객체
type MyUnion = 'a' | 'b'           // 유니온 타입
```

### 4. **ESLint 규칙**

```typescript
// ❌ 금지:
// @ts-ignore
someCode();

function foo(param: any) {}

const map: Map<string, {}> = new Map();

function bar(callback: Function) {}

console.log('debug'); // 특정 파일 외에는 금지

// ✅ 올바른 사용:
/* eslint-disable @typescript-eslint/no-explicit-any */
// 이유: 서드파티 라이브러리에 타입이 없음
function foo(param: any) {}

const map: Map<string, Record<string, unknown>> = new Map();

function bar(callback: (data: string) => void) {}

/* eslint-disable no-console */
console.log('이 파일에서는 허용');
```

## 📋 커밋 전 체크리스트

**모든 커밋 전에 확인:**

- [ ] `pnpm type-check` 통과 (0 errors)
- [ ] `pnpm lint` 통과 (0 errors)
- [ ] `any` 타입 사용 안 함 (또는 eslint-disable로 명시)
- [ ] `{}` 타입 사용 안 함
- [ ] `Function` 타입 사용 안 함
- [ ] `@ts-ignore` 사용 안 함 (`@ts-expect-error` 사용)
- [ ] 모든 함수에 타입 정의
- [ ] console.log 제거 (또는 eslint-disable)

## 🎯 타입 변환 가이드

| ❌ 사용 금지 | ✅ 대신 사용                 |
| ------------ | ---------------------------- |
| `any`        | `unknown` 또는 구체적 타입   |
| `{}`         | `Record<string, unknown>`    |
| `Function`   | `(args: Type) => ReturnType` |
| `Object`     | `Record<string, unknown>`    |
| `@ts-ignore` | `@ts-expect-error` + 주석    |

## 🚫 CI 실패 원인

다음의 경우 CI가 실패합니다:

- Type check 실패
- Lint check 실패 (errors만, warnings는 허용)
- 테스트 실패

## 💡 예외 허용 파일

다음 파일들만 완화된 규칙 적용:

- `tests/**/*.spec.ts` - 테스트 파일
- `tests/**/*.test.ts` - 테스트 파일
- `**/*.d.ts` - 타입 정의 파일
- `**/mock*.ts` - Mock 파일

## 🎯 핵심 원칙

**절대 금지:**

- 타입 에러가 있는 커밋
- Lint 에러가 있는 커밋
- 정당한 이유 없이 `any` 사용
- `{}` 타입 사용
- `Function` 타입 사용
- 검증 단계 생략

**이것은 선택이 아닌 필수입니다.**

위반 시 CI 실패 및 배포 차단됩니다.

---

**자세한 내용:** `.claude/TYPESCRIPT_ENFORCEMENT.md` 참조
