# Gemini AI 개발 가이드

> **프로젝트:** AI Workflow Manager  
> **기술 스택:** Electron + Vue 3 + TypeScript + Drizzle ORM + SQLite

## 🚨 필수 읽기

**1순위:** `.gemini/TYPESCRIPT_RULES.md` - **MANDATORY 타입 안전성 규칙**  
**2순위:** `.claude/CLAUDE_CODE_INSTRUCTIONS.md` - 상세 개발 가이드  
**3순위:** `.claude/DEVELOPMENT_GUIDELINES.md` - 아키텍처 원칙

## ⚡ 빠른 시작

### 코드 변경 전 필수 확인

```bash
# 1. 타입 체크
pnpm type-check

# 2. 린트 체크
pnpm lint

# 3. 둘 다 통과해야 커밋 가능
git add -A && git commit -m "..."
```

## 🎯 핵심 규칙

### ❌ 절대 금지

- `any`, `{}`, `Function`, `Object` 타입 사용
- `@ts-ignore` 사용
- Type/Lint 에러가 있는 커밋
- 상대 경로 import (`../../../`)
- console.log (특정 파일 제외)

### ✅ 필수 사항

- 모든 함수에 타입 정의
- Path alias 사용 (`@/`, `@core/`, `@modules/`)
- 에러 핸들링 추가
- JSDoc 주석 (public API)
- 커밋 전 type-check + lint 실행

## 📁 프로젝트 구조

```
src/
├── renderer/           # Vue 3 프론트엔드
│   ├── modules/       # 기능별 모듈
│   ├── stores/        # Pinia 스토어
│   └── components/    # Vue 컴포넌트
├── core/              # 공유 타입 및 유틸
└── services/          # 비즈니스 로직

electron/
├── main/              # Electron 메인 프로세스
│   ├── ipc/          # IPC 핸들러
│   └── database/     # Drizzle ORM
└── preload/           # Preload 스크립트
```

## 🔧 일반적인 작업

### 새 기능 추가

1. **타입 정의** (`src/core/types/`)
2. **데이터베이스 스키마** (`electron/main/database/schema.ts`)
3. **Repository** (`electron/main/database/repositories/`)
4. **IPC 핸들러** (`electron/main/ipc/`)
5. **Preload API** (`electron/preload/api/`)
6. **Pinia Store** (`src/renderer/stores/`)
7. **Vue 컴포넌트** (`src/renderer/modules/`)

### Vue 컴포넌트 템플릿

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
    item: ItemType;
}
const props = defineProps<Props>();

const emit = defineEmits<{
    update: [value: Type];
}>();

const state = ref<Type>(initialValue);
</script>

<template>
    <!-- 컴포넌트 내용 -->
</template>
```

## 🧪 테스트

```bash
pnpm test              # 모든 테스트
pnpm test:unit         # 유닛 테스트
pnpm test:integration  # 통합 테스트
```

## 🐛 디버깅

```bash
# TypeScript 에러 확인
pnpm type-check

# Lint 에러 확인
pnpm lint

# 개발 서버 실행
pnpm dev
```

## 📚 추가 문서

- **상세 가이드:** `.claude/CLAUDE_CODE_INSTRUCTIONS.md`
- **아키텍처:** `ARCHITECTURE.md`
- **프로젝트 구조:** `PROJECT_STRUCTURE.md`
- **코드 템플릿:** `.claude/CODE_TEMPLATES.md`

---

**중요:** 모든 변경사항은 반드시 `pnpm type-check` + `pnpm lint` 통과 후 커밋!
