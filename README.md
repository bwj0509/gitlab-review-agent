# gitlab-mr-review-bot

최소 기능만 가진 GitLab MR webhook 서버입니다.

현재 동작:
- `POST /webhook/gitlab`
- `X-Gitlab-Token` 검증
- `merge_request` 이벤트만 처리
- `open`, `update`, `reopen` 액션만 처리
- GitLab API로 MR diff 조회
- Gemini API로 리뷰 생성
- GitLab API로 MR note 등록

## Local Run

1. 환경변수 파일 생성

```powershell
Copy-Item .env.example .env
```

2. `.env` 값 수정

```env
PORT=3000
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_BOT_TOKEN=your_gitlab_bot_token
GITLAB_WEBHOOK_SECRET=your_webhook_secret
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TEMPERATURE=0.1
GEMINI_MAX_OUTPUT_TOKENS=3072
REVIEW_MAX_DIFF_CHARS=50000
```

3. 실행

```powershell
npm install
npm run dev
```

4. 상태 확인

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/health
```

## Local Webhook Test

GitLab 연결 전에 샘플 payload로 먼저 확인할 수 있습니다.

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

정상이라면 서버가 GitLab API로 MR note 등록을 시도합니다.

## GitLab Webhook Setting

- URL: `http(s)://<server>/webhook/gitlab`
- Secret Token: `.env` 의 `GITLAB_WEBHOOK_SECRET`
- Trigger: `Merge request events`
- Bot token: MR note 작성 권한이 있는 토큰 사용

## AI Review Guide

- 저장소 루트의 `CODEREVIEW.md` 내용이 Gemini 프롬프트에 포함됩니다.
- 저장소별 리뷰 기준이 있으면 이 파일을 수정해서 반영할 수 있습니다.

## Gemini Model

- 기본 모델은 `gemini-2.5-flash` 입니다.
- 더 긴 리뷰가 필요하면 `.env`의 `GEMINI_MAX_OUTPUT_TOKENS` 값을 늘릴 수 있습니다.
