const { AI_REVIEW_MARKER, GITLAB_BASE_URL, GITLAB_BOT_TOKEN } = require("../config/env");

async function gitlabApiRequest({ endpoint, method = "GET", body }) {
  if (!GITLAB_BASE_URL || !GITLAB_BOT_TOKEN) {
    throw new Error("GITLAB_BASE_URL or GITLAB_BOT_TOKEN is not configured");
  }

  const normalizedBaseUrl = GITLAB_BASE_URL.replace(/\/+$/, "");
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
    throw new Error(`GitLab API error ${response.status}: ${responseText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getMergeRequest(projectId, mergeRequestIid) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}`
  });
}

async function getMergeRequestChanges(projectId, mergeRequestIid) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/changes`
  });
}

async function createMergeRequestNote(projectId, mergeRequestIid, body) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/notes`,
    method: "POST",
    body: { body }
  });
}

async function getMergeRequestNotes(projectId, mergeRequestIid) {
  return gitlabApiRequest({
    endpoint:
      `/api/v4/projects/${encodeURIComponent(projectId)}` +
      `/merge_requests/${encodeURIComponent(mergeRequestIid)}/notes`
  });
}

async function getLatestAiReviewNote(projectId, mergeRequestIid) {
  const notes = await getMergeRequestNotes(projectId, mergeRequestIid);

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
