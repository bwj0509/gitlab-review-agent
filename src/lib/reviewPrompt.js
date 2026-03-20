const { AI_REVIEW_MARKER, OPENAI_MODEL } = require("../config/env");

const SEVERITY_GUIDE = [
  "Severity guide:",
  "- 높음: 기능 오류, 보안 문제, 권한 문제, 데이터 손상 가능성, 명백한 회귀",
  "- 중간: 운영상 문제, 잘못된 상태 처리, 유지보수 리스크가 큰 문제",
  "- 낮음: 정리 필요, 경미한 비일관성, 품질 저하 요소"
].join("\n");

const GLOBAL_REVIEW_PRINCIPLES = [
  "Global review principles:",
  "- Judge only from the current MR diff and explicitly provided context.",
  "- Avoid asking for large refactors outside the changed scope.",
  "- In follow-up reviews, if a previously problematic code path no longer appears in the latest diff, treat it as resolved and prefer [반영됨] over [확인불가] unless there is strong evidence otherwise.",
  "- Order findings from highest severity to lowest severity.",
  "- If there are no meaningful issues, do not invent comments."
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
  "- If the latest diff is exactly '변경된 파일이 없습니다.', classify prior findings as [반영됨] by default.",
  "- When the latest diff is empty, do not use [확인불가] just because there is no changed file.",
  "- In an empty latest diff, writing [확인불가] for prior findings is incorrect unless the previous review itself is too ambiguous to identify what was reported.",
  "- If the previously problematic code or pattern is no longer visible in the latest diff, treat it as [반영됨].",
  "- Do not mark [확인불가] merely because the exact old code is absent from the latest diff. Absence of the problematic code in the updated diff is practical evidence that the issue was addressed.",
  "- Use [확인불가] only in the exceptional case where the latest diff still shows related code, but the available context is genuinely insufficient to judge whether the prior issue was fixed.",
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
  "- The new-findings section is only for issues that were not already mentioned in the previous AI review.",
  "- Any issue already covered in the previous-review tracking section must not appear again in the new-findings section.",
  "- If a prior issue is classified as [반영됨], [미반영], or [확인불가], do not repeat it as a new finding.",
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

function buildReviewPrompt({ mergeRequest, diffText, previousReview, reviewGuide }) {
  if (previousReview) {
    return buildFollowUpReviewPrompt({ diffText, mergeRequest, previousReview, reviewGuide });
  }

  return buildInitialReviewPrompt({ mergeRequest, diffText, reviewGuide });
}

function buildQuestionPrompt({ mergeRequest, diffText, reviewGuide, userRequest, extraContext }) {
  return [
    "You are a senior engineer answering a question about a GitLab merge request.",
    "This answer will be posted as a GitLab MR note, so keep it concise and easy to scan.",
    "Focus on the user's requested file, code path, or risk.",
    "Base the answer only on the merge request metadata and diff provided.",
    "When Related code context includes the full content of a directly mentioned file, treat that file as fully read.",
    "If the requested target is not present in the diff or the available context is insufficient, say that clearly.",
    "Keep the answer concise by default.",
    "If the topic is broad, lead with the conclusion and include only the most important 2 to 4 points.",
    "Prefer omitting secondary details over giving an exhaustive explanation.",
    "Do not explain every type, field, or example one by one unless the user explicitly asks for that level of detail.",
    "For comparison questions, summarize the difference first and then list at most 3 concrete differences.",
    "For refactoring questions, prioritize the top 2 or 3 improvements rather than listing every possible cleanup.",
    "If more detail would be needed for full coverage, mention that briefly in the check-points section instead of expanding the main answer.",
    "Respond in Korean.",
    "",
    "Output format:",
    '- Start with "### 요청 해석" on one line.',
    "- Then add a blank line and briefly restate the user's question in Korean.",
    '- Then add a blank line followed by "---" on one line.',
    '- Then add a blank line and write "### 답변" on one line.',
    "- In that section, answer directly and concretely in Korean.",
    '- Then add a blank line followed by "---" on one line.',
    '- Then add a blank line and write "### 확인 포인트" on one line.',
    '- Use bullets beginning with "-".',
    '- If there are no extra checks or follow-ups, write "- 추가 확인 포인트가 없습니다."',
    "",
    `User request: ${userRequest}`,
    "",
    formatMergeRequestContext({ diffLabel: "Relevant diff", diffText, extraContext, mergeRequest, reviewGuide })
  ].join("\n");
}

function buildInitialReviewPrompt({ mergeRequest, diffText, reviewGuide }) {
  return [
    "You are a senior code reviewer reviewing a GitLab merge request.",
    "Focus on correctness, regressions, security, and missing tests.",
    GLOBAL_REVIEW_PRINCIPLES,
    "Repository-specific core checklist items are highest-priority review rules, not optional hints.",
    "When the review guide's core checklist or frequent-problem rules are violated, report that violation before lower-level issues such as unused imports or style concerns.",
    "Treat architectural boundary violations from the repository rules as concrete issues supported by the diff.",
    "If shared imports from entities, features, widgets, pages, or app, always report it as an FSD layer violation.",
    "Type-only imports also count as layer dependencies.",
    "Do not downgrade an FSD boundary violation to a mere unused import issue when the import itself breaks the layer rules.",
    "Only report concrete issues that are supported by the diff.",
    "If there are no meaningful issues, say that clearly.",
    "Respond in Korean.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    INITIAL_FINDINGS_SECTION_RULES,
    "",
    formatMergeRequestContext({ diffLabel: "Diff", diffText, mergeRequest, reviewGuide })
  ].join("\n");
}

function buildFollowUpReviewPrompt({ mergeRequest, diffText, previousReview, reviewGuide }) {
  return [
    "You are a senior code reviewer reviewing an updated GitLab merge request.",
    "Focus on correctness, regressions, security, missing tests, and whether previous review findings were addressed.",
    GLOBAL_REVIEW_PRINCIPLES,
    "Repository-specific core checklist items are highest-priority review rules, not optional hints.",
    "When the review guide's core checklist or frequent-problem rules are violated, report that violation before lower-level issues such as unused imports or style concerns.",
    "Treat architectural boundary violations from the repository rules as concrete issues supported by the diff.",
    "If shared imports from entities, features, widgets, pages, or app, always report it as an FSD layer violation.",
    "Type-only imports also count as layer dependencies.",
    "Do not downgrade an FSD boundary violation to a mere unused import issue when the import itself breaks the layer rules.",
    "Only report concrete issues that are supported by the latest diff and the previous AI review.",
    "If the latest diff is '변경된 파일이 없습니다.', treat previously reported issues as resolved by default and mark them as [반영됨].",
    "When the latest diff is empty, choosing [확인불가] only because there are no changed files is wrong.",
    "Respond in Korean.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    FOLLOW_UP_SECTIONS_RULES,
    "",
    formatMergeRequestContext({ diffLabel: "Latest diff", diffText, mergeRequest, reviewGuide }),
    "",
    "Previous AI review:",
    previousReview
  ].join("\n");
}

function buildChunkReviewPrompt({ chunkDiffText, chunkIndex, chunkCount, mergeRequest, reviewGuide }) {
  return [
    "You are reviewing one chunk of a large GitLab merge request.",
    "Review only the diff content in this chunk.",
    "Focus on correctness, regressions, security, and missing tests.",
    GLOBAL_REVIEW_PRINCIPLES,
    "Only report concrete issues supported by this chunk. Do not mention issues that are not visible in this chunk.",
    "Respond in Korean.",
    "",
    CHUNK_REVIEW_RULES,
    "",
    `Chunk: ${chunkIndex}/${chunkCount}`,
    `Merge request title: ${mergeRequest.title || ""}`,
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
    SEVERITY_GUIDE,
    "",
    "Chunk diff:",
    chunkDiffText
  ].join("\n");
}

function buildChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview, reviewGuide }) {
  if (previousReview) {
    return buildFollowUpChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview, reviewGuide });
  }

  return buildInitialChunkSynthesisPrompt({ chunkReviews, mergeRequest, reviewGuide });
}

function buildQuestionChunkPrompt({ chunkDiffText, chunkIndex, chunkCount, mergeRequest, reviewGuide, userRequest }) {
  return [
    "You are answering a user question about one chunk of a GitLab merge request.",
    "Focus only on information visible in this chunk.",
    "Do not assume code outside this chunk.",
    "Respond in Korean.",
    "",
    "Output format:",
    '- Start with "### chunk_answer" on one line.',
    "- Then answer in concise Korean prose.",
    "- Mention whether this chunk is relevant to the user's request.",
    "",
    `User request: ${userRequest}`,
    `Chunk: ${chunkIndex}/${chunkCount}`,
    `Merge request title: ${mergeRequest.title || ""}`,
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
    "Chunk diff:",
    chunkDiffText
  ].join("\n");
}

function buildQuestionChunkSynthesisPrompt({ chunkReviews, mergeRequest, reviewGuide, userRequest, extraContext }) {
  return [
    "You are synthesizing chunk-level answers for a user question about a GitLab merge request.",
    "Use only the chunk answers below.",
    "This answer will be posted as a GitLab MR note, so keep it concise and easy to scan.",
    "When Related code context includes the full content of a directly mentioned file, treat that file as fully read.",
    "If the question cannot be answered confidently from the available diff, say that clearly.",
    "Keep the answer concise by default.",
    "If the topic is broad, lead with the conclusion and include only the most important 2 to 4 points.",
    "Prefer omitting secondary details over giving an exhaustive explanation.",
    "Do not explain every type, field, or example one by one unless the user explicitly asks for that level of detail.",
    "For comparison questions, summarize the difference first and then list at most 3 concrete differences.",
    "For refactoring questions, prioritize the top 2 or 3 improvements rather than listing every possible cleanup.",
    "If more detail would be needed for full coverage, mention that briefly in the check-points section instead of expanding the main answer.",
    "Respond in Korean.",
    "",
    "Output format:",
    '- Start with "### 요청 해석" on one line.',
    "- Then add a blank line and briefly restate the user's question in Korean.",
    '- Then add a blank line followed by "---" on one line.',
    '- Then add a blank line and write "### 답변" on one line.',
    "- In that section, answer directly and concretely in Korean.",
    '- Then add a blank line followed by "---" on one line.',
    '- Then add a blank line and write "### 확인 포인트" on one line.',
    '- Use bullets beginning with "-".',
    '- If there are no extra checks or follow-ups, write "- 추가 확인 포인트가 없습니다."',
    "",
    `Merge request title: ${mergeRequest.title || ""}`,
    `User request: ${userRequest}`,
    "",
    formatExtraContextSection(extraContext),
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
    "Chunk answers:",
    formatChunkReviewsForPrompt(chunkReviews)
  ].join("\n");
}

function buildInitialChunkSynthesisPrompt({ chunkReviews, mergeRequest, reviewGuide }) {
  return [
    "You are synthesizing partial code review results for a large GitLab merge request.",
    "Use the chunk review results below to write one final MR review comment in Korean.",
    "Deduplicate overlapping findings and prioritize the most important issues.",
    GLOBAL_REVIEW_PRINCIPLES,
    "Do not invent issues that are not supported by the chunk review results.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    INITIAL_FINDINGS_SECTION_RULES,
    "",
    `Merge request title: ${mergeRequest.title || ""}`,
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
    "Chunk review results:",
    formatChunkReviewsForPrompt(chunkReviews)
  ].join("\n");
}

function buildFollowUpChunkSynthesisPrompt({ chunkReviews, mergeRequest, previousReview, reviewGuide }) {
  return [
    "You are synthesizing partial code review results for an updated large GitLab merge request.",
    "Use the chunk review results below and the previous AI review to write one final MR review comment in Korean.",
    "Deduplicate overlapping findings and prioritize the most important issues.",
    GLOBAL_REVIEW_PRINCIPLES,
    "Do not invent issues that are not supported by the chunk review results.",
    "",
    "Output format:",
    SUMMARY_SECTION_RULES,
    FOLLOW_UP_SECTIONS_RULES,
    "",
    `Merge request title: ${mergeRequest.title || ""}`,
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
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

function formatMergeRequestContext({ diffLabel, diffText, extraContext, mergeRequest, reviewGuide }) {
  return [
    `Merge request title: ${mergeRequest.title || ""}`,
    `Source branch: ${mergeRequest.source_branch || ""}`,
    `Target branch: ${mergeRequest.target_branch || ""}`,
    "Description:",
    mergeRequest.description || "(no description)",
    "",
    formatExtraContextSection(extraContext),
    "Review guide:",
    reviewGuide || "(no repository-specific review guide provided)",
    "",
    `${diffLabel}:`,
    diffText
  ]
    .filter(Boolean)
    .join("\n");
}

function formatExtraContextSection(extraContext) {
  if (!extraContext) {
    return "";
  }

  return ["Related code context:", extraContext, ""].join("\n");
}

function buildReviewBody(reviewText) {
  return [AI_REVIEW_MARKER, "", `## AI Review (${OPENAI_MODEL})`, "", reviewText.trim()].join("\n");
}

function buildQuestionBody(reviewText) {
  return [AI_REVIEW_MARKER, "", `## AI Answer (${OPENAI_MODEL})`, "", reviewText.trim()].join("\n");
}

module.exports = {
  buildReviewBody,
  buildQuestionBody,
  buildQuestionChunkPrompt,
  buildQuestionChunkSynthesisPrompt,
  buildQuestionPrompt,
  buildChunkReviewPrompt,
  buildChunkSynthesisPrompt,
  buildReviewPrompt
};
