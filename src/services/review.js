const { AI_REVIEW_MARKER, PREVIOUS_REVIEW_MAX_CHARS } = require("../config/env");
const { buildReviewDiff } = require("../lib/diff");
const { logInfo } = require("../lib/logger");
const {
  buildChunkReviewPrompt,
  buildChunkSynthesisPrompt,
  buildReviewBody,
  buildReviewPrompt
} = require("../lib/reviewPrompt");
const {
  createMergeRequestNote,
  getLatestAiReviewNote,
  getMergeRequest,
  getMergeRequestChanges
} = require("./gitlab");
const { generateReview } = require("./openai");

async function createReviewNote(projectId, mergeRequestIid, requestId) {
  const [mergeRequest, changesPayload, previousAiReviewNote] = await Promise.all([
    getMergeRequest(projectId, mergeRequestIid, requestId),
    getMergeRequestChanges(projectId, mergeRequestIid, requestId),
    getLatestAiReviewNote(projectId, mergeRequestIid, requestId)
  ]);

  const reviewDiff = buildReviewDiff(changesPayload.changes || []);
  const previousReview = formatPreviousReviewForPrompt(previousAiReviewNote?.body);
  logInfo("review_context_prepared", {
    requestId,
    projectId,
    mergeRequestIid,
    changeCount: Array.isArray(changesPayload.changes) ? changesPayload.changes.length : 0,
    diffChars: reviewDiff.mode === "single" ? reviewDiff.promptDiffText.length : 0,
    fullDiffChars: reviewDiff.fullDiffChars,
    isTruncated: reviewDiff.isTruncated,
    reviewMode: reviewDiff.mode,
    chunkCount: reviewDiff.chunkCount || 0,
    hasPreviousReview: Boolean(previousReview)
  });
  const reviewText =
    reviewDiff.mode === "single"
      ? await generateSingleReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff })
      : await generateChunkedReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff });

  return buildReviewBody(reviewText);
}

async function postReviewNote(projectId, mergeRequestIid, requestId) {
  logInfo("review_note_creation_started", {
    requestId,
    projectId,
    mergeRequestIid
  });
  const reviewBody = await createReviewNote(projectId, mergeRequestIid, requestId);
  await createMergeRequestNote(projectId, mergeRequestIid, reviewBody, requestId);
  logInfo("review_note_created", {
    requestId,
    projectId,
    mergeRequestIid,
    reviewChars: reviewBody.length
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

async function generateSingleReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff }) {
  const prompt = buildReviewPrompt({
    mergeRequest,
    diffText: reviewDiff.promptDiffText,
    previousReview
  });

  return generateReview(prompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "single"
  });
}

async function generateChunkedReview({ mergeRequest, mergeRequestIid, previousReview, projectId, requestId, reviewDiff }) {
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
      mergeRequest
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
    previousReview
  });

  return generateReview(synthesisPrompt, {
    requestId,
    projectId,
    mergeRequestIid,
    reviewMode: "chunk_synthesis",
    chunkCount: reviewDiff.chunkCount
  });
}

module.exports = {
  postReviewNote
};
