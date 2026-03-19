const express = require("express");
const crypto = require("crypto");

const { ALLOWED_ACTIONS, GITLAB_WEBHOOK_SECRET } = require("../config/env");
const { logError, logInfo } = require("../lib/logger");
const { postReviewNote } = require("../services/review");

const router = express.Router();

router.post("/gitlab", async (req, res) => {
  const requestId = crypto.randomUUID();
  const webhookSecret = req.get("x-gitlab-token");

  if (!GITLAB_WEBHOOK_SECRET) {
    console.error("GITLAB_WEBHOOK_SECRET is not configured");
    logError("gitlab_webhook_config_missing", { requestId });
    return res.status(500).json({ message: "Server is not configured" });
  }

  if (webhookSecret !== GITLAB_WEBHOOK_SECRET) {
    logError("gitlab_webhook_unauthorized", { requestId });
    return res.status(401).json({ message: "Invalid webhook secret" });
  }

  if (req.body?.object_kind !== "merge_request") {
    logInfo("gitlab_webhook_ignored_kind", {
      requestId,
      objectKind: req.body?.object_kind || null
    });
    return res.status(200).json({ message: "Ignored: unsupported event" });
  }

  const action = req.body?.object_attributes?.action;
  if (!ALLOWED_ACTIONS.has(action)) {
    logInfo("gitlab_webhook_ignored_action", {
      requestId,
      action: action || null
    });
    return res.status(200).json({ message: `Ignored: unsupported action ${action || "unknown"}` });
  }

  const projectId = req.body?.project?.id;
  const mergeRequestIid = req.body?.object_attributes?.iid;
  if (!projectId || !mergeRequestIid) {
    logError("gitlab_webhook_missing_identifiers", {
      requestId,
      projectId: projectId || null,
      mergeRequestIid: mergeRequestIid || null
    });
    return res.status(400).json({ message: "Missing project.id or object_attributes.iid" });
  }

  try {
    logInfo("gitlab_webhook_received", {
      requestId,
      projectId,
      mergeRequestIid,
      action
    });
    console.log(`Processing MR webhook: project=${projectId}, iid=${mergeRequestIid}, action=${action}`);
    await postReviewNote(projectId, mergeRequestIid, requestId);
    logInfo("gitlab_webhook_processed", {
      requestId,
      projectId,
      mergeRequestIid,
      action
    });
    return res.status(200).json({ message: "Note created" });
  } catch (error) {
    console.error("Failed to create MR note", error);
    logError("gitlab_webhook_failed", {
      requestId,
      projectId,
      mergeRequestIid,
      action,
      message: error.message
    });
    return res.status(500).json({ message: "Failed to create MR note" });
  }
});

module.exports = router;
