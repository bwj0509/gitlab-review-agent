const { AI_REVIEW_MARKER, GITLAB_BASE_URL, GITLAB_BOT_TOKEN } = require("../config/env");
const { logError, logInfo } = require("../lib/logger");

async function gitlabApiRequest({ endpoint, method = "GET", body, requestId }) {
  if (!GITLAB_BASE_URL || !GITLAB_BOT_TOKEN) {
    throw new Error("GITLAB_BASE_URL or GITLAB_BOT_TOKEN is not configured");
  }

  const normalizedBaseUrl = GITLAB_BASE_URL.replace(/\/+$/, "");
  const startedAt = Date.now();
  const response = await fetch(`${normalizedBaseUrl}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": GITLAB_BOT_TOKEN
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const responseText = await response.text();
    logError("gitlab_api_request_failed", {
      requestId,
      method,
      endpoint,
      status: response.status,
      durationMs: Date.now() - startedAt,
      message: responseText
    });
    throw new Error(`GitLab API error ${response.status}: ${responseText}`);
  }

  logInfo("gitlab_api_request_completed", {
    requestId,
    method,
    endpoint,
    status: response.status,
    durationMs: Date.now() - startedAt
  });

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getMergeRequest(projectId, mergeRequestIid, requestId) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}`,
    requestId
  });
}

async function getMergeRequestChanges(projectId, mergeRequestIid, requestId) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/changes`,
    requestId
  });
}

async function createMergeRequestNote(projectId, mergeRequestIid, body, requestId) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/notes`,
    method: "POST",
    body: { body },
    requestId
  });
}

async function getMergeRequestNotes(projectId, mergeRequestIid, requestId) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/notes`,
    requestId
  });
}

async function getLatestAiReviewNote(projectId, mergeRequestIid, requestId) {
  const notes = await getMergeRequestNotes(projectId, mergeRequestIid, requestId);

  return notes
    .filter((note) => isAiReviewNote(note.body))
    .sort((a, b) => getNoteTimestamp(b) - getNoteTimestamp(a))[0];
}

function isAiReviewNote(noteBody) {
  if (typeof noteBody !== "string") {
    return false;
  }

  return noteBody.includes(AI_REVIEW_MARKER) || noteBody.includes("## AI Review (");
}

function getNoteTimestamp(note) {
  const timestamp = Date.parse(note?.created_at || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

module.exports = {
  createMergeRequestNote,
  getLatestAiReviewNote,
  getMergeRequest,
  getMergeRequestChanges
};
