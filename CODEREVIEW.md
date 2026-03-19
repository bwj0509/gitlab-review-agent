# CODEREVIEW.md

## 리뷰 원칙

- 현재 MR diff 기준으로만 판단한다.
- 버그, 회귀, 정책 위반을 스타일보다 우선한다.
- 변경 범위를 벗어난 대규모 리팩터링 요구는 지양한다.

## 핵심 체크리스트

- FSD 레이어 책임이 맞는지 보고, `shared`에 도메인 전용 로직이 들어가지 않았는지 확인한다.
- `features`, `entities` 루트의 `index.ts` 배럴이 필요한 경우 유지되는지 본다.
- 함수형 컴포넌트와 화살표 함수 스타일을 지키고, `React.FC`, 불필요한 `any`, 과한 단언이 없는지 본다.
- JSX 유무에 따라 `.ts`와 `.tsx`를 올바르게 사용하는지 확인한다.
- 배럴 파일 외 import는 `@/...` 절대 경로를 사용하는지 본다.
- API 호출은 `shared/lib/axios.ts`를 사용하고, 서버 응답 raw 구조를 임의 변환하지 않는지 확인한다.
- 서버 상태는 TanStack Query 중심으로 처리하고, 조회성 패턴에서 `placeholderData: keepPreviousData` 누락이 없는지 본다.
- `invalidateQueries`, `onSuccess`, `onError`, 토스트 처리는 컴포넌트가 아니라 mutation 훅 내부에 있는지 확인한다.
- 전역 상태는 꼭 필요한 경우에만 `shared/model`에 추가됐는지 본다.
- 라우트 접근 제어는 Guard, 내부 권한 분기는 `useAccess`를 사용하며 기본은 `ROLE`, 예외만 `PERMISSION`을 쓰는지 확인한다.

## UI 변경 시 추가 확인

- 글로벌 CSS는 `index.css`에서만 관리한다.
- styled-components 사용이 불필요하게 늘어나지 않았는지 본다.
- Chakra theme 값을 하드코딩하지 않고 theme를 통해 접근하는지 확인한다.
- 모달은 `ModalInfoItem`, `SimpleGrid columns={{ base: 1, md: 2 }}`, `VStack align="stretch" gap="24px"` 패턴을 따르는지 본다.
- 모달 하단에 `Divider`를 추가하지 않는다.

## 자주 잡아야 할 문제

- 컴포넌트에서 직접 API 성공/실패 토스트를 호출한 경우
- 컴포넌트에서 직접 `invalidateQueries`를 호출한 경우
- 서버 응답을 임의로 매핑하거나 snake/camel 변환한 경우
- 권한 체크 없이 액션 버튼만 노출한 경우
- `pages`에 비즈니스 로직/상태가 과하게 들어간 경우
- `shared`에 특정 도메인 전용 코드가 들어간 경우
- 상대 경로 import를 추가한 경우
- 모달 UI 패턴이 기존 규칙과 달라진 경우

## 리뷰 코멘트 원칙

- 치명도 높은 이슈부터 남긴다.
- mock 관련 변경은 큰 이슈가 아니면 굳이 코멘트하지 않는다.
- 문제 없으면 억지 코멘트를 만들지 않는다.
