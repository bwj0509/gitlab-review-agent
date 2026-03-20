# gitlab-mr-review-bot

GitLab Merge Request 이벤트를 받아 AI 리뷰 코멘트를 자동으로 등록하는 Node.js + Express 서버입니다.

이 서버는 webhook 자체에 들어 있는 정보만으로 리뷰하지 않습니다. webhook은 트리거 역할만 하고, 실제 리뷰에 필요한 MR 메타데이터, 변경사항, 이전 AI 리뷰 노트는 GitLab API를 다시 호출해서 수집합니다.

## 제공 기능

1. MR에 대한 AI 코드리뷰 진행
2. MR 코멘트에서 bot을 멘션해 AI 보조 답변 받기

## 빠른 사용법

### 1. MR 자동 리뷰

- `merge_request` 이벤트 중 `open` 액션이 오면 AI가 MR 리뷰 코멘트를 등록합니다.
- 리뷰에는 MR diff, 이전 AI 리뷰 노트, 저장소별 `CODEREVIEW.md`가 함께 반영됩니다.

### 2. MR 코멘트에서 AI 호출

- MR 코멘트에 bot 멘션을 남기면 추가 응답을 받을 수 있습니다.
- 예:
  - `@review-bot 다시 리뷰해줘`
  - `@review-bot src/entities/module/types/moduleList.ts src/entities/module/types/moduleDetail.ts 차이 설명해줘`
  - `@review-bot src/shared/ui/Table/table.ts 이 파일 리팩토링 방향 알려줘`

질문 모드에서는:

- 직접 언급한 파일을 최대 3개까지 추가 조회합니다.
- 질문 응답은 MR note에 맞게 짧고 핵심 위주로 작성합니다.

## 상세 설명

### What It Does

- `POST /webhook/gitlab` 엔드포인트로 GitLab webhook을 받습니다.
- `merge_request` 이벤트 중 `open` 액션이 오면 MR diff를 조회해 AI 리뷰 코멘트를 등록합니다.
- `note` 이벤트가 오면 특정 멘션을 기준으로 재리뷰 또는 질문 응답을 등록합니다.
- 이전 AI 리뷰 노트를 다시 읽어 후속 리뷰에서 `반영됨 / 미반영 / 확인불가`를 추적합니다.
- diff가 길면 chunk 단위로 나눠 여러 번 검토한 뒤 결과를 합칩니다.
- 질문 응답 모드에서는 사용자가 직접 언급한 파일을 최대 3개까지 GitLab API로 추가 조회해 답변 근거로 사용합니다.
- 리뷰 대상 프로젝트의 `source branch` 루트 `CODEREVIEW.md`를 GitLab API로 읽어 프롬프트에 포함합니다.
- 실행 로그를 `logs/app.log`에 JSON Lines 형식으로 기록합니다.

## Architecture

```text
+-------------------+        webhook         +------------------------+
| GitLab            | ---------------------> | Express Webhook Route  |
| - Merge Request   |                        | - /webhook/gitlab      |
| - Notes           | <--------------------- |                        |
+---------+---------+      review note       +-----------+------------+
          |                                                |
          | GitLab REST API                                |
          v                                                v
+-------------------+                            +------------------------+
| GitLab API        | <------------------------> | Review Service         |
| - MR metadata     |                            | - load MR              |
| - MR changes      |                            | - load diff            |
| - MR notes        |                            | - load previous review |
+-------------------+                            | - build prompt         |
                                                 +-----------+------------+
                                                             |
                                                             | prompt / response
                                                             v
                                                 +------------------------+
                                                 | OpenAI Responses API   |
                                                 | - review generation    |
                                                 +------------------------+
```

## Sequence Flow

```text
GitLab User
   |
   | 1. Create MR
   v
GitLab
   |
   | 2. Send merge_request webhook
   v
Express Webhook Route
   |
   | 3. Validate X-Gitlab-Token
   | 4. Extract project.id / merge request iid
   v
Review Service
   |
   | 5. GET MR metadata
   | 6. GET MR changes
   | 7. GET previous AI review notes
   | 8. GET source branch CODEREVIEW.md
   v
GitLab API
   |
   | 9. Return MR context
   v
Review Service
   |
   | 10. Build prompt from diff + MR metadata + review guide
   | 11. Request AI review
   v
OpenAI Responses API
   |
   | 12. Return review text
   v
Review Service
   |
   | 13. POST MR note
   v
GitLab API
   |
   | 14. Review comment appears on MR
   v
GitLab User
```

## Event Handling

### 1. Merge Request Event

현재는 `merge_request` 이벤트 중 `open` 액션만 자동 리뷰 대상으로 처리합니다.

- 허용 액션: `open`
- 무시되는 예시: `update`, `reopen`, 그 외 미지원 액션

처리 순서:
- webhook secret 검증
- `project.id`, `object_attributes.iid` 추출
- GitLab API로 MR 정보와 변경사항 조회
- 이전 AI 리뷰 노트 조회
- OpenAI에 리뷰 요청
- MR note 등록

### 2. Note Event

MR 코멘트에 특정 멘션이 들어오면 bot이 추가 응답을 남깁니다.

- 대상: `noteable_type === "MergeRequest"`
- 대상 액션: `create`
- system note는 무시
- bot 자신이 작성한 코멘트는 무시
- 멘션이 없으면 무시

멘션 요청은 두 가지 모드로 처리됩니다.

- `review` 모드
  이전과 같은 형식의 MR 리뷰를 다시 생성합니다.
- `question` 모드
  사용자가 특정 파일, 이슈, 위험 요소를 물으면 관련 diff와 직접 언급한 파일을 함께 참고해 답변합니다.

질문 모드 동작:
- 사용자 코멘트에서 파일 경로를 추출합니다.
- 직접 언급된 파일은 최대 3개까지 GitLab API로 추가 조회합니다.
- MR 변경 파일과 일치하면 해당 경로를 우선 사용하고, 일치하지 않아도 질문에 적힌 경로 그대로 조회를 시도합니다.
- 우선 `source_branch`에서 조회하고, 없으면 `target_branch`로 한 번 더 시도합니다.
- 질문 응답은 MR note에 맞게 짧고 핵심 위주로 작성하도록 프롬프트를 압축합니다.

## Review Output

### 초기 리뷰

초기 리뷰는 아래 형식으로 작성됩니다.

- `### 📝 요약`
- `### 🚨 발견사항`

발견사항은 위험도(`높음`, `중간`, `낮음`)와 함께 파일 경로, 문제, 제안을 포함합니다.

### 후속 리뷰

이전 AI 리뷰 노트가 있으면 후속 리뷰 형식으로 작성됩니다.

- `### 📝 요약`
- `### 🔄 이전 리뷰 반영 확인`
- `### 🚨 새로 발견한 사항`

후속 리뷰에서는 이전 항목을 아래 상태로 분류합니다.

- `[반영됨]`
- `[미반영]`
- `[확인불가]`

현재 프롬프트 기준으로는 다음 원칙을 사용합니다.

- 최신 diff에서 이전 문제 코드가 더 이상 보이지 않으면 기본적으로 `[반영됨]`으로 판단합니다.
- 변경 파일이 아예 없는 경우에도 기본적으로 이전 지적 사항은 `[반영됨]`으로 봅니다.
- `[확인불가]`는 관련 코드는 남아 있지만 문맥이 정말 부족할 때만 예외적으로 사용합니다.

### 질문 응답

멘션 기반 질문 응답은 아래 형식으로 작성됩니다.

- `### 요청 해석`
- `### 답변`
- `### 확인 포인트`

질문 응답 원칙:

- 기본적으로 짧고 스캔하기 쉽게 작성합니다.
- 비교 질문은 차이 요약과 핵심 차이 2~3개 위주로 답합니다.
- 리팩토링 질문은 우선순위가 높은 개선 포인트 2~3개를 먼저 제시합니다.
- 직접 언급된 파일의 전체 본문을 읽은 경우, 해당 파일은 전체를 확인한 것으로 간주합니다.

## Diff Handling

리뷰는 Git 저장소를 직접 읽지 않고 GitLab MR diff를 기준으로 수행합니다.

- MR webhook payload에서 `project.id`, `iid` 같은 식별자만 받습니다.
- 실제 변경사항은 GitLab API `GET /api/v4/projects/:projectId/merge_requests/:iid/changes` 로 다시 조회합니다.
- 변경 파일이 없으면 프롬프트에는 `변경된 파일이 없습니다.`를 사용합니다.
- diff가 길면 `REVIEW_CHUNK_MAX_CHARS` 기준으로 나눠 chunk review를 수행합니다.
- 전체 diff 길이는 `REVIEW_MAX_DIFF_CHARS` 기준으로 single/chunked 모드를 나눕니다.

## Repository-Specific Review Guide

리뷰 대상 프로젝트의 `source branch` 루트 `CODEREVIEW.md` 파일을 GitLab API로 읽어 AI 프롬프트에 포함합니다.

- 조회 경로: `CODEREVIEW.md`
- 조회 기준 ref: MR의 `source_branch`
- 조회 기준 project: MR의 `source_project_id` 우선, 없으면 현재 `project.id`
- 파일이 없으면 공통 프롬프트 규칙만 사용합니다.

여기에 다음 같은 규칙을 둘 수 있습니다.

- 아키텍처 규칙
- 레이어 규칙
- 금지 패턴
- 리뷰 우선순위
- 후속 리뷰 판단 원칙

즉 이 서버의 일반 리뷰 로직은 코드에 있고, 저장소별 상세 리뷰 기준은 리뷰 대상 프로젝트의 `CODEREVIEW.md`로 분리되어 있습니다.

## Runtime And Endpoints

### Server

- Runtime: Node.js
- Framework: Express
- Entry: `src/server.js`
- App setup: `src/app.js`

### Endpoints

- `GET /health`
  - 응답: `{ "ok": true }`
- `POST /webhook/gitlab`
  - GitLab webhook 수신

## Environment Variables

다음 환경변수가 필요합니다.

```env
PORT=3000
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_BOT_TOKEN=your_gitlab_bot_token
GITLAB_WEBHOOK_SECRET=your_webhook_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=3072
REVIEW_MAX_DIFF_CHARS=100000
REVIEW_CHUNK_MAX_CHARS=35000
PREVIOUS_REVIEW_MAX_CHARS=8000
QUESTION_EXTRA_CONTEXT_MAX_FILES=3
GITLAB_REVIEW_MENTIONS=@review-bot,@codex
GITLAB_BOT_USERNAMES=review-bot
```

### Variable Notes

- `GITLAB_BASE_URL`: GitLab 호스트 주소
- `GITLAB_BOT_TOKEN`: MR note 조회/작성 권한이 있는 토큰
- `GITLAB_WEBHOOK_SECRET`: `X-Gitlab-Token` 검증용 값
- `OPENAI_API_KEY`: OpenAI Responses API 호출용 키
- `OPENAI_MODEL`: 기본값 `gpt-5.4-mini`
- `OPENAI_REASONING_EFFORT`: 기본값 `low`
- `QUESTION_EXTRA_CONTEXT_MAX_FILES`: 질문 모드에서 추가 조회할 직접 언급 파일 수. 기본값 `3`
- `GITLAB_REVIEW_MENTIONS`: note 이벤트에서 bot 호출로 인식할 멘션 목록. 쉼표로 구분
- `GITLAB_BOT_USERNAMES`: bot 자신의 사용자명 목록. 자기 코멘트 무한루프 방지용

## Local Run

1. 의존성 설치

```powershell
npm install
```

2. 프로젝트 루트에 `.env` 파일 생성 후 환경변수 입력

3. 개발 서버 실행

```powershell
npm run dev
```

4. 프로덕션 형태로 실행

```powershell
npm start
```

5. 상태 확인

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/health
```

## Local Webhook Test

샘플 MR webhook payload는 `examples/merge-request-webhook.json`에 들어 있습니다.

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "X-Gitlab-Token" = "your_webhook_secret"
}

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3000/webhook/gitlab `
  -Headers $headers `
  -InFile .\examples\merge-request-webhook.json
```

정상이라면 서버가 GitLab API를 다시 호출해 리뷰 노트 작성을 시도합니다.

## GitLab Setup

GitLab webhook 설정 예시는 다음과 같습니다.

- URL: `http(s)://<server>/webhook/gitlab`
- Secret Token: `.env`의 `GITLAB_WEBHOOK_SECRET`
- Trigger:
  - `Merge request events`
  - `Note events` 사용 시 멘션 기반 질문/재리뷰도 가능

bot 토큰에는 최소한 아래 권한이 필요합니다.

- MR 조회 권한
- MR note 조회 권한
- MR note 작성 권한

## Logging

애플리케이션 로그는 `logs/app.log`에 기록됩니다.

특징:

- JSON Lines 형식
- 요청 ID 포함
- GitLab API 호출 결과 기록
- OpenAI 요청/응답 메타데이터 기록
- 에러 이벤트 기록

콘솔에도 일부 실행 정보가 출력됩니다.

## Project Structure

```text
src/
  app.js                  Express app setup
  server.js               Server bootstrap
  config/
    env.js                Environment variable parsing
  lib/
    contextCollector.js    Question-mode file context loader
    diff.js               Diff formatting and chunking
    logger.js             File logger
    reviewPrompt.js       Prompt builders
  routes/
    gitlabWebhook.js      GitLab webhook handlers
  services/
    gitlab.js             GitLab REST API client
    openai.js             OpenAI Responses API client
    review.js             Review orchestration
examples/
  merge-request-webhook.json
```

## Current Limitations

- 현재 자동 리뷰 대상 MR 액션은 `open`만 지원합니다.
- 리뷰는 GitLab diff 기준이며, 변경되지 않은 주변 파일 본문은 별도로 읽지 않습니다.
- `note` 질문 응답은 직접 언급된 파일을 최대 3개까지 추가 조회하지만, 그 외 연관 파일을 재귀적으로 탐색하지는 않습니다.
- 질문 응답은 MR note 길이를 고려해 의도적으로 요약되므로, 모든 세부사항을 빠짐없이 설명하지는 않습니다.
- 테스트나 lint 실행은 이 서버가 자동으로 수행하지 않습니다.
- `.env.example` 파일은 현재 저장소에 포함되어 있지 않습니다.
