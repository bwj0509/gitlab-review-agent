const { formatChangesForPrompt } = require("../lib/diff");
const { buildReviewBody, buildReviewPrompt } = require("../lib/reviewPrompt");
const { createMergeRequestNote, getMergeRequest, getMergeRequestChanges } = require("./gitlab");
const { generateReview } = require("./openai");

async function createReviewNote(projectId, mergeRequestIid) {
  const [mergeRequest, changesPayload] = await Promise.all([
    getMergeRequest(projectId, mergeRequestIid),
    getMergeRequestChanges(projectId, mergeRequestIid)
  ]);

  const diffText = formatChangesForPrompt(changesPayload.changes || []);
  const prompt = buildReviewPrompt({ mergeRequest, diffText });
  const reviewText = await generateReview(prompt);

  return buildReviewBody(reviewText);
}

async function postReviewNote(projectId, mergeRequestIid) {
  const reviewBody = await createReviewNote(projectId, mergeRequestIid);
  await createMergeRequestNote(projectId, mergeRequestIid, reviewBody);
}

module.exports = {
  postReviewNote
};
