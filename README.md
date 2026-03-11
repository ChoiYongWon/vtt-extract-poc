# vtt-poc

`SPECIFICATION2.md` 기준 초기 모노레포 골격입니다.

구성:

- `apps/web`: Next.js App Router 기반 웹 앱과 API 라우트
- `apps/worker`: Fargate 실행을 가정한 자막 추출 워커
- `packages/types`: 웹/워커 공용 타입

현재 상태:

- UI는 스펙의 2탭 레이아웃과 주요 흐름을 반영한 초기 화면을 제공합니다.
- API는 로컬 개발용 mock 동작을 포함합니다.
- 워커는 실제 인프라 연결 지점을 분리한 파이프라인 초안입니다.

