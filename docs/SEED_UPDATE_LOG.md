# Seed 데이터가 성공적으로 업데이트되었습니다

## 업데이트 정보

- **업데이트 일시**: 2025-12-01
- **프로젝트 수**: 1개 (HighFlow 개발)
- **태스크 수**: 15개 메인 태스크 + MCP 서브태스크 5개

## 현재 Seed 데이터

현재 `electron/main/database/seed.ts`의 데이터는 실제 프로덕션 환경의 프로젝트 구조를 반영하고 있습니다.

## 다음 업데이트 방법

향후 seed 데이터를 다시 업데이트하려면:

```bash
# 1. 현재 DB 데이터 export
pnpm tsx scripts/export-seed-data.ts

# 2. export된 JSON 파일 확인
cat scripts/seed-export.json

# 3. seed.ts 파일 수동 업데이트 (필요시)
# electron/main/database/seed.ts 파일 편집

# 4. DB 리셋 및 테스트
rm -rf .dev-data/
pnpm dev:electron
```

## 참고사항

- seed 데이터는 DB가 **비어있을 때만** 자동 실행됩니다
- 사용자 ID, 팀 ID는 기본 구조를 유지하도록 설계되어 있습니다
- 태스크 의존성 (triggerConfig)도 그대로 유지됩니다
