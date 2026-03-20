const { AI_REVIEW_MARKER, PREVIOUS_REVIEW_MAX_CHARS } = require("../config/env");
const { buildReviewDiff } = require("../lib/diff");
const { logInfo } = require("../lib/logger");
const {
  buildQuestionBody,
  buildQuestionChunkPrompt,
  buildQuestionChunkSynthesisPrompt,
  buildQuestionPrompt,
  buildChunkReviewPrompt,
  buildChunkSynthesisPrompt,
  buildReviewBody,
  buildReviewPrompt
} = require("../lib/reviewPrompt");
const {
  createMergeRequestNote,
  getLatestAiReviewNote,
  getMergeRequest,
  getMergeRequestChanges,
  getReviewGuideForMergeRequest
} = require("./gitlab");
const { generateReview } = require("./openai");

async function createReviewNote(projectId, mergeRequestIid, requestId, options = {}) {
  const responseMode = options.responseMode || "review";
  const userRequest = options.userRequest || "";
  const [mergeRequest, changesPayload, previousAiReviewNote] = await Promise.all([
    getMergeRequest(projectId, mergeRequestIid, requestId),
    getMergeRequestChanges(projectId, mergeRequestIid, requestId),
    responseMode === "review"
      ? getLatestAiReviewNote(projectId, mergeRequestIid, requestId)
      : Promise.resolve(null)
  ]);
  const reviewGuide = await getReviewGuideForMergeRequest(projectId, mergeRequest, requestId);

  const relevantChanges =
    responseMode === "question" ? selectRelevantChanges(changesPayload.changes || [], userRequest) : changesPayload.changes || [];
  const reviewDiff = buildReviewDiff(relevantChanges);
  const previousReview = formatPreviousReviewForPrompt(previousAiReviewNote?.body);
  logInfo("review_context_prepared", {
    requestId,
    projectId,
    mergeRequestIid,
    changeCount: Array.isArray(relevantChanges) ? relevantChanges.length : 0,
    originalChangeCount: Array.isArray(changesPayload.changes) ? changesPayload.changes.length : 0,
    diffChars: reviewDiff.mode === "single" ? reviewDiff.promptDiffText.length : 0,
    fullDiffChars: reviewDiff.fullDiffChars,
    isTruncated: reviewDiff.isTruncated,
    reviewMode: reviewDiff.mode,
    chunkCount: reviewDiff.chunkCount || 0,
    hasPreviousReview: Boolean(previousReview),
    responseMode,
    hasUserRequest: Boolean(userRequest),
    hasReviewGuide: Boolean(reviewGuide)
  });
  const reviewText = await generateResponseText({
    mergeRequest,
    mergeRequestIid,
    previousReview,
    projectId,
    requestId,
    responseMode,
    reviewDiff,
    reviewGuide,
    userRequest
  });

  return responseMode === "question" ? buildQuestionBody(reviewText) : buildReviewBody(reviewText);
}

async function postReviewNote(projectId, mergeRequestIid, requestId, options = {}) {
  logInfo("review_note_creation_started", {
    requestId,
    projectId,
    mergeRequestIid,
    responseMode: options.responseMode || "review"
  });
  const reviewBody = await createReviewNote(projectId, mergeRequestIid, requestId, options);
  await createMergeRequestNote(projectId, mergeRequestIid, reviewBody, requestId);
  logInfo("review_note_created", {
    requestId,
    projectId,
    mergeRequestIid,
    reviewChars: reviewBody.length,
    responseMode: options.responseMode || "review"
  });
}

function formatPreviousReviewForPrompt(reviewBody) {
  if (!reviewBody) {
    return "";
  }

  const normalizedBody = reviewBody.replace(AI_REVIEW_MARKER, "").trim();
  if (normalizedBody.length <= PREVIOUS_REVIEW_MAX_CHARS) {
    return normalizedBody;
  }

  return `${normalizedBody.slice(0, PREVIOUS_REVIEW_MAX_CHARS)}\n\n[previous review truncated due to size limit]`;
}

async function generateSingleReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff, reviewGuide }) {
  const prompt = buildReviewPrompt({
    mergeRequest,
    diffText: reviewDiff.promptDiffText,
    previousReview,
    reviewGuide
  });

  return generateReview(prompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "single"
  });
}

async function generateSingleQuestion({ mergeRequest, mergeRequestIid, projectId, requestId, reviewDiff, reviewGuide, userRequest }) {
  const prompt = buildQuestionPrompt({
    mergeRequest,
    diffText: reviewDiff.promptDiffText,
    reviewGuide,
    userRequest
  });

  return generateReview(prompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "question_single"
  });
}

async function generateChunkedReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff, reviewGuide }) {
  const chunkReviews = [];

  for (const chunk of reviewDiff.chunks) {
    logInfo("review_chunk_started", {
      requestId,
      projectId,
      mergeRequestIid,
      chunkChars: chunk.chars,
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount,
      fileCount: chunk.filePaths.length
    });

    const chunkPrompt = buildChunkReviewPrompt({
      chunkDiffText: chunk.text,
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount,
      mergeRequest,
      reviewGuide
    });
    const reviewText = await generateReview(chunkPrompt, {
      requestId,
      projectId,
      mergeRequestIid,
      reviewMode: "chunk",
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount
    });

    chunkReviews.push({
      chunkCount: reviewDiff.chunkCount,
      chunkIndex: chunk.index,
      reviewText
    });
  }

  const synthesisPrompt = buildChunkSynthesisPrompt({
    chunkReviews,
    mergeRequest,
    previousReview,
    reviewGuide
  });

  return generateReview(synthesisPrompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "chunk_synthesis",
    chunkCount: reviewDiff.chunkCount
  });
}

async function generateChunkedQuestion({ mergeRequest, mergeRequestIid, projectId, requestId, reviewDiff, reviewGuide, userRequest }) {
  const chunkReviews = [];

  for (const chunk of reviewDiff.chunks) {
    logInfo("review_chunk_started", {
      requestId,
      projectId,
      mergeRequestIid,
      chunkChars: chunk.chars,
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount,
      fileCount: chunk.filePaths.length,
      responseMode: "question"
    });

    const chunkPrompt = buildQuestionChunkPrompt({
      chunkDiffText: chunk.text,
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount,
      mergeRequest,
      reviewGuide,
      userRequest
    });
    const reviewText = await generateReview(chunkPrompt, {
      requestId,
      projectId,
      mergeRequestIid,
      reviewMode: "question_chunk",
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount
    });

    chunkReviews.push({
      chunkCount: reviewDiff.chunkCount,
      chunkIndex: chunk.index,
      reviewText
    });
  }

  const synthesisPrompt = buildQuestionChunkSynthesisPrompt({
    chunkReviews,
    mergeRequest,
    reviewGuide,
    userRequest
  });

  return generateReview(synthesisPrompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "question_chunk_synthesis",
    chunkCount: reviewDiff.chunkCount
  });
}

async function generateResponseText({
  mergeRequest,
  mergeRequestIid,
  previousReview,
  projectId,
  requestId,
  responseMode,
  reviewDiff,
  reviewGuide,
  userRequest
}) {
  if (responseMode === "question") {
    return reviewDiff.mode === "single"
      ? generateSingleQuestion({ mergeRequest, mergeRequestIid, projectId, requestId, reviewDiff, reviewGuide, userRequest })
      : generateChunkedQuestion({ mergeRequest, mergeRequestIid, projectId, requestId, reviewDiff, reviewGuide, userRequest });
  }

  return reviewDiff.mode === "single"
    ? generateSingleReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff, reviewGuide })
    : generateChunkedReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff, reviewGuide });
}

function selectRelevantChanges(changes, userRequest) {
  const fileHints = extractFileHints(userRequest);
  if (fileHints.length === 0) {
    return changes;
  }

  const matchedChanges = changes.filter((change) => {
    const filePath = `${change.new_path || ""} ${change.old_path || ""}`.toLowerCase();
    return fileHints.some((fileHint) => filePath.includes(fileHint));
  });

  return matchedChanges.length > 0 ? matchedChanges : changes;
}

function extractFileHints(userRequest) {
  if (typeof userRequest !== "string") {
    return [];
  }

  return [...userRequest.matchAll(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g)].map((match) => match[0].toLowerCase());
}

module.exports = {
  postReviewNote
};
