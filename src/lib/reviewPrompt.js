const { AI_REVIEW_MARKER, OPENAI_MODEL, REVIEW_GUIDE } = require("../config/env");

const SEVERITY_GUIDE = [
  "Severity guide:",
  "- 높음: 기능 오류, 보안 문제, 권한 문제, 데이터 손상 가능성, 명백한 회귀",
  "- 중간: 운영상 문제, 잘못된 상태 처리, 유지보수 리스크가 큰 문제",
  "- 낮음: 정리 필요, 경미한 비일관성, 품질 저하 요소"
].join("\n");

const SUMMARY_SECTION_RULES = [
  '- Start with "### 📝 요약" on one line.',
  "- Then add a blank line.",
  "- Then write the summary content."
].join("\n");

const INITIAL_FINDINGS_SECTION_RULES = [
  '- Then add a blank line followed by "---" on one line.',
  '- Then add a blank line and write "### 🚨 발견사항" on one line.',
  SEVERITY_GUIDE,
  '- Use bullets beginning with "-".',
  "- For each finding include severity in Korean as one of:",
  "  [위험도: 높음]",
  "  [위험도: 중간]",
  "  [위험도: 낮음]",
  "- Start each finding with one line in this format:",
  "  - [위험도: 높음|중간|낮음] <file path>[:<line number if reasonably inferable>]",
  "- If the exact line number is not reasonably inferable from the diff, omit the line number.",
  "- Insert one blank line after the first line of each finding.",
  "- After that, write these fields in Korean on separate paragraphs using bold labels:",
  "  **문제**: <concrete issue>",
  "",
  "  **제안**: <specific fix or follow-up>",
  "- Keep the finding concise. Fold the impact or reason into **문제** when needed instead of adding another section.",
  "- Insert one blank line between **문제** and **제안** so GitLab markdown renders them on separate lines.",
  "- Keep each finding tightly grounded in the diff.",
  '- If there are no findings, write "- 큰 문제를 찾지 못했습니다."'
].join("\n");

const FOLLOW_UP_SECTIONS_RULES = [
  '- Then add a blank line followed by "---" on one line.',
  '- Then add a blank line and write "### 🔄 이전 리뷰 반영 확인" on one line.',
  SEVERITY_GUIDE,
  '- Under that section, use bullets beginning with "-" in one of these formats:',
  "  - [위험도: 높음|중간|낮음][반영됨] <file path>[:<line number if reasonably inferable>]",
  "  - [위험도: 높음|중간|낮음][미반영] <file path>[:<line number if reasonably inferable>]",
  '  - [위험도: 높음|중간|낮음][확인불가] <file path or "변경 영역">',
  "- Insert one blank line after each bullet line.",
  "- For each bullet, write:",
  "  **문제**: <the prior issue in concise Korean>",
  "",
  '  **제안**: <say "반영 확인됨", or explain what still needs to change, or say it could not be verified from the latest diff>',
  '- If there are no prior findings to track, write "- 확인할 이전 리뷰 항목이 없습니다."',
  "- For every meaningful prior finding, classify it as [반영됨], [미반영], or [확인불가]. Do not omit [반영됨] items.",
  "- Keep the previous finding's original practical severity and include it in Korean in the bracket prefix, such as [위험도: 중간][미반영].",
  "- If the issue is no longer visible in the latest diff, prefer [반영됨].",
  "- Use [확인불가] only when the latest diff does not include enough relevant context to make a practical judgment.",
  '- When the status is [반영됨], keep **문제** very short. Summarize only the previously reported issue itself, such as "이전 리뷰에서 지적된 console.log 제거 대상".',
  '- Then add a blank line followed by "---" on one line.',
  '- Then add a blank line and write "### 🚨 새로 발견한 사항" on one line.',
  "- For newly found issues, use this format:",
  "  - [위험도: 높음|중간|낮음] <file path>[:<line number if reasonably inferable>]",
  "",
  "  **문제**: <concrete new issue>",
  "",
  "  **제안**: <specific fix or follow-up>",
  '- If there are no new findings, write "- 큰 문제를 찾지 못했습니다."',
  "- Do not repeat resolved items as new findings."
].join("\n");

const CHUNK_REVIEW_RULES = [
  'Output format:',
  '- Use bullets beginning with "-".',
  "- For each finding, use this first line format:",
  "  - [위험도: 높음|중간|낮음] <file path>[:<line number if reasonably inferable>]",
  "- After a blank line, write:",
  "  **문제**: <concrete issue>",
  "",
  "  **제안**: <specific fix or follow-up>",
  '- If there are no findings in this chunk, write "- 큰 문제를 찾지 못했습니다."'
].join("\n");

function buildReviewPrompt({ mergeRequest, diffText, previousReview }) {
  if (previousReview) {
    return buildFollowUpReviewPrompt({ diffText, mergeRequest, previousReview });
  }

  return buildInitialReviewPrompt({ mergeRequest, diffText });
}

function buildInitialReviewPrompt({ mergeRequest, diffText }) {
  return [
    "You are a senior code reviewer reviewing a GitLab merge request.",
    "Focus on correctness, regressions, security, and missing tests.",
    "Only report concrete issues that are supported by the diff.",
    "If there are no meaningful issues, say that clearly.",
    "Respond in Korean.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    INITIAL_FINDINGS_SECTION_RULES,
    "",
    formatMergeRequestContext({ diffLabel: "Diff", diffText, mergeRequest })
  ].join("\n");
}

function buildFollowUpReviewPrompt({ mergeRequest, diffText, previousReview }) {
  return [
    "You are a senior code reviewer reviewing an updated GitLab merge request.",
    "Focus on correctness, regressions, security, missing tests, and whether previous review findings were addressed.",
    "Only report concrete issues that are supported by the latest diff and the previous AI review.",
    "Respond in Korean.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    FOLLOW_UP_SECTIONS_RULES,
    "",
    formatMergeRequestContext({ diffLabel: "Latest diff", diffText, mergeRequest }),
    "",
    "Previous AI review:",
    previousReview
  ].join("\n");
}

function buildChunkReviewPrompt({ chunkDiffText, chunkIndex, chunkCount, mergeRequest }) {
  return [
    "You are reviewing one chunk of a large GitLab merge request.",
    "Review only the diff content in this chunk.",
    "Focus on correctness, regressions, security, and missing tests.",
    "Only report concrete issues supported by this chunk. Do not mention issues that are not visible in this chunk.",
    "Respond in Korean.",
    "",
    CHUNK_REVIEW_RULES,
    "",
    `Chunk: ${chunkIndex}/${chunkCount}`,
    `Merge request title: ${mergeRequest.title || ""}`,
    SEVERITY_GUIDE,
    "",
    "Chunk diff:",
    chunkDiffText
  ].join("\n");
}

function buildChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview }) {
  if (previousReview) {
    return buildFollowUpChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview });
  }

  return buildInitialChunkSynthesisPrompt({ chunkReviews, mergeRequest });
}

function buildInitialChunkSynthesisPrompt({ chunkReviews, mergeRequest }) {
  return [
    "You are synthesizing partial code review results for a large GitLab merge request.",
    "Use the chunk review results below to write one final MR review comment in Korean.",
    "Deduplicate overlapping findings and prioritize the most important issues.",
    "Do not invent issues that are not supported by the chunk review results.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    INITIAL_FINDINGS_SECTION_RULES,
    "",
    `Merge request title: ${mergeRequest.title || ""}`,
    "Chunk review results:",
    formatChunkReviewsForPrompt(chunkReviews)
  ].join("\n");
}

function buildFollowUpChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview }) {
  return [
    "You are synthesizing partial code review results for an updated large GitLab merge request.",
    "Use the chunk review results below and the previous AI review to write one final MR review comment in Korean.",
    "Deduplicate overlapping findings and prioritize the most important issues.",
    "Do not invent issues that are not supported by the chunk review results.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    FOLLOW_UP_SECTIONS_RULES,
    "",
    `Merge request title: ${mergeRequest.title || ""}`,
    "Previous AI review:",
    previousReview,
    "",
    "Chunk review results:",
    formatChunkReviewsForPrompt(chunkReviews)
  ].join("\n");
}

function formatChunkReviewsForPrompt(chunkReviews) {
  return chunkReviews
    .map((chunkReview) => {
      return [`[Chunk ${chunkReview.chunkIndex}/${chunkReview.chunkCount}]`, chunkReview.reviewText].join("\n");
    })
    .join("\n\n---\n\n");
}

function formatMergeRequestContext({ diffLabel, diffText, mergeRequest }) {
  return [
    `Merge request title: ${mergeRequest.title || ""}`,
    `Source branch: ${mergeRequest.source_branch || ""}`,
    `Target branch: ${mergeRequest.target_branch || ""}`,
    "Description:",
    mergeRequest.description || "(no description)",
    "",
    "Review guide:",
    REVIEW_GUIDE || "(no repository-specific review guide provided)",
    "",
    `${diffLabel}:`,
    diffText
  ].join("\n");
}

function buildReviewBody(reviewText) {
  return [AI_REVIEW_MARKER, "", `## AI Review (${OPENAI_MODEL})`, "", reviewText.trim()].join("\n");
}

module.exports = {
  buildReviewBody,
  buildChunkReviewPrompt,
  buildChunkSynthesisPrompt,
  buildReviewPrompt
};
