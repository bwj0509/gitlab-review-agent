# AGENTS.md

## 목적

이 저장소에서 Codex/에이전트가 따라야 할 규칙과 작업 흐름을 정의한다.

## 프로젝트 요약

- React + TypeScript + Vite 기반
- Feature-Sliced Design(FSD) 구조 사용
- UI: Chakra UI + styled-components
- 상태: Jotai, 서버 상태: TanStack Query

## 디렉터리 규칙 (FSD)

- `app/`: 전역 설정 및 초기화 (Provider, 라우팅)
- `pages/`: 라우트 단위 UI, 조합 위주 (새 상태/로직 최소화)
- `features/`: 사용자 행동 단위 기능
- `entities/`: 도메인 정보 중심
- `widgets/`: 여러 feature 조합 컴포넌트
- `shared/`: 공통 훅/유틸/타입/테마
- `features`, `entities`의 도메인 루트에는 `index.ts` 배럴 파일을 둔다

## 코드 스타일

- TypeScript/React 함수형 컴포넌트 기본
- 컴포넌트는 화살표 함수로 작성한다
- `React.FC` 사용 금지
- 파일 확장자는 JSX 사용 여부로 결정한다 (`.ts` 우선, JSX가 있으면 `.tsx`)
- **import는 배럴 파일(`index.ts`)을 제외하고 절대 경로(`@/...`)를 사용한다**
- 포매팅은 Prettier 설정(`.prettierrc.json`)을 따른다
- ESLint 규칙 준수 (`eslint.config.js`)
- 불필요한 주석 금지, 복잡한 로직에만 짧게 설명

## UI/스타일

- 글로벌 CSS는 `index.css`에서만 설정
- 기본 폰트는 Pretendard (이미 `index.html`에서 로드됨)
- styled-components 사용 최소화
- Chakra theme 변수는 Chakra theme를 통해 접근
- 모달 하단에 Divider를 두지 않는다

## 데이터/상태

- API 인스턴스는 `shared/lib/axios.ts` 사용
- **서버 응답(raw)은 그대로 사용한다.** entity 타입은 서버 응답 필드/구조와 동일하게 두고, API 레이어에서는 매핑·변환 없이 `data`를 그대로 반환한다. 참고: `entities/module` 패턴.
- 서버 상태는 TanStack Query 중심
- `useQuery` 사용 시 `placeholderData: keepPreviousData`를 기본값으로 사용
- 전역 상태는 `shared/model`에 한정
- `useMutation` 후처리(`onSuccess`, `onError`)는 기본적으로 도메인 `entities` 훅에서 처리한다
- 등록/수정/승인/삭제 후 캐시 무효화(`invalidateQueries`)는 컴포넌트가 아니라 mutation 훅 내부에서 수행한다
- 성공/실패 토스트(`toastMsg`)는 컴포넌트에서 직접 호출하지 않고 mutation 훅의 `onSuccess`/`onError`에서 처리한다

## 권한 가이드

- 라우트 접근 제어는 Guard에서 처리 (`CommonUserGuard`, `AdminDeveloperGuard`, `AdminGuard`)
- 페이지/컴포넌트 내부 권한은 `useAccess`로 판단한다.
- **기본**: ROLE(ADMIN, DEVELOPER, USER)을 사용한다. `useAccess({ roles: [ROLE.ADMIN] })` 처럼 역할 기준으로 판단한다.
- **예외**: 특정 인원만 허용/제외해야 할 때는 Permission을 사용한다. 권한 키는 `permission.const.ts`에 정의하고, `useAccess({ permissions: [PERMISSION.xxx] })`로 판단한다. 서버에서 역할별 기본 권한·개별 허용/거부(deniedPermissions)를 내려주는 구조와 연동한다.

## 모달 코드 스타일

- 모달 내부 정보 영역은 `ModalInfoItem` 패턴으로 구성한다 (label은 `textStyle="subtitle_2"` + `color="text.info"`)
- 두 컬럼 정보는 `SimpleGrid columns={{ base: 1, md: 2 }}` + `gap="24px"` 사용
- 섹션 간격은 `VStack align="stretch" gap="24px"`로 통일

## 작업 흐름

1. 요구사항 요약 및 영향 범위 확인
2. `rg`로 관련 파일 탐색
3. 최소 변경으로 구현
4. 수정한 파일과 검증 방법 제시

## 질문과 요청 구분

- 사용자가 **확인/질문**만 한 경우(예: "있어?", "되는지 확인해줘", "공통으로 쓸 수 있는 게 있어?")에는 **답변만** 한다. 해당 사항이 있는지·어디에 있는지 알려주고, 코드 수정은 하지 않는다.
- 코드 변경이 필요하면 사용자가 **명시적으로 요청**했을 때만 수행한다. 질문에 대한 답만으로는 구현하지 않고, 필요 시 "원하시면 이렇게 바꿔드릴까요?"처럼 제안 후 진행한다.

## 지시 vs 질문에 따른 동작

- **지시** (코드 변경 작업을 요청할 때): "~해줘", "~구현해줘", "~수정해줘", "~추가해줘" 등 **동작·작업을 지시**하는 문장이면 **코드를 수정**한다.
- **질문** (무언가를 물어볼 때): "~인가?", "~확인해줘", "~알려줘", "뭐가 문제야" 등 **정보·상태를 묻는** 문장이면 **코드는 건드리지 않고** 요청한 내용만 **말로 답변**한다. 수정이 필요하면 사용자가 판단한 뒤 별도로 지시할 때 반영한다.

## 실행/검증 명령

- 개발 서버: `npm run dev`
- 린트: `npm run lint`
- 빌드: `npm run build` (prebuild에 아이콘 생성 포함)

## 검증 실행 정책

- 기본적으로 작업 완료 시 `lint`를 자동 실행하지 않는다.
- `lint`/`build`는 사용자가 요청했을 때만 실행한다.
- 빠른 확인이 필요할 때는 변경 파일 범위의 최소 검증만 수행한다.

## 금지/주의

- 대규모 리팩터링은 사전 합의 없이 금지
- 파괴적 명령(`git reset --hard`, 강제 삭제) 금지
- 네트워크 접근이 필요하면 먼저 요청

## 응답 형식

- 변경 요약
- 수정한 파일 목록
- 다음 단계(테스트/검증) 제안
