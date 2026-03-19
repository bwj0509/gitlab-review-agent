const { AI_REVIEW_MARKER, PREVIOUS_REVIEW_MAX_CHARS } = require("../config/env");
const { buildReviewDiff } = require("../lib/diff");
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

async function createReviewNote(projectId, mergeRequestIid) {
  const [mergeRequest, changesPayload, previousAiReviewNote] = await Promise.all([
    getMergeRequest(projectId, mergeRequestIid),
    getMergeRequestChanges(projectId, mergeRequestIid),
    getLatestAiReviewNote(projectId, mergeRequestIid)
  ]);

  const reviewDiff = buildReviewDiff(changesPayload.changes || []);
  const previousReview = formatPreviousReviewForPrompt(previousAiReviewNote?.body);
  const reviewText =
    reviewDiff.mode === "single"
      ? await generateSingleReview({ mergeRequest, previousReview, reviewDiff })
      : await generateChunkedReview({ mergeRequest, previousReview, reviewDiff });

  return buildReviewBody(reviewText);
}

async function postReviewNote(projectId, mergeRequestIid) {
  const reviewBody = await createReviewNote(projectId, mergeRequestIid);
  await createMergeRequestNote(projectId, mergeRequestIid, reviewBody);
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

async function generateSingleReview({ mergeRequest, previousReview, reviewDiff }) {
  const prompt = buildReviewPrompt({
    mergeRequest,
    diffText: reviewDiff.promptDiffText,
    previousReview
  });

  return generateReview(prompt);
}

async function generateChunkedReview({ mergeRequest, previousReview, reviewDiff }) {
  const chunkReviews = [];

  for (const chunk of reviewDiff.chunks) {
    const chunkPrompt = buildChunkReviewPrompt({
      chunkDiffText: chunk.text,
      chunkIndex: chunk.index,
      chunkCount: reviewDiff.chunkCount,
      mergeRequest
    });
    const reviewText = await generateReview(chunkPrompt);

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

  return generateReview(synthesisPrompt);
}

module.exports = {
  postReviewNote
};
