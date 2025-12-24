# Seed Data Management

현재 DB를 초기 프리셋 데이터로 설정하는 방법

## 방법 1: Export 스크립트 사용 (권장)

1. **현재 DB 데이터 export:**

```bash
pnpm tsx scripts/export-seed-data.ts
```

2. **생성된 `scripts/seed-export.json` 파일 확인**

3. **`electron/main/database/seed.ts` 업데이트:**
    - export된 JSON 데이터를 seed.ts의 해당 부분에 복사/붙여넣기
    - 사용자 ID, 팀 ID 등을 적절히 조정

## 방법 2: 수동 업데이트

1. **현재 seed.ts 수정:**
    - `electron/main/database/seed.ts` 파일 열기
    - `mainTasks` 배열을 원하는 데이터로 교체
    - 프로젝트 정보도 필요 시 수정

2. **DB 초기화 및 재시드:**

```bash
# 개발 데이터 삭제
rm -rf .dev-data/

# 앱 재시작 (자동으로 새 DB 생성 및 seed 실행)
pnpm dev:electron
```

## 현재 seed.ts 구조

- **사용자**: Demo User (admin)
- **팀**: Demo Team
- **프로젝트**: "HighFlow 개발"
- **태스크**: 15개 메인 태스크 + MCP 서브태스크 5개

## 주의사항

⚠️ seed 데이터는 DB가 **비어있을 때만** 실행됩니다.

- `seedDatabase()` 함수는 사용자 수가 0일 때만 실행
- 기존 데이터가 있으면 자동으로 스킵

## 개발 환경 리셋

완전히 새로 시작하고 싶다면:

```bash
rm -rf .dev-data/
pnpm dev:electron
```
