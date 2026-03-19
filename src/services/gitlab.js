const { GITLAB_BASE_URL, GITLAB_BOT_TOKEN } = require("../config/env");

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

module.exports = {
  createMergeRequestNote,
  getMergeRequest,
  getMergeRequestChanges
};
