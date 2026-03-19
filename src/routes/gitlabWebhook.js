const express = require("express");

const { ALLOWED_ACTIONS, GITLAB_WEBHOOK_SECRET } = require("../config/env");
const { postReviewNote } = require("../services/review");

const router = express.Router();

router.post("/gitlab", async (req, res) => {
  const webhookSecret = req.get("x-gitlab-token");

  if (!GITLAB_WEBHOOK_SECRET) {
    console.error("GITLAB_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ message: "Server is not configured" });
  }

  if (webhookSecret !== GITLAB_WEBHOOK_SECRET) {
    return res.status(401).json({ message: "Invalid webhook secret" });
  }

  if (req.body?.object_kind !== "merge_request") {
    return res.status(200).json({ message: "Ignored: unsupported event" });
  }

  const action = req.body?.object_attributes?.action;
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(200).json({ message: `Ignored: unsupported action ${action || "unknown"}` });
  }

  const projectId = req.body?.project?.id;
  const mergeRequestIid = req.body?.object_attributes?.iid;
  if (!projectId || !mergeRequestIid) {
    return res.status(400).json({ message: "Missing project.id or object_attributes.iid" });
  }

  try {
    console.log(`Processing MR webhook: project=${projectId}, iid=${mergeRequestIid}, action=${action}`);
    await postReviewNote(projectId, mergeRequestIid);
    return res.status(200).json({ message: "Note created" });
  } catch (error) {
    console.error("Failed to create MR note", error);
    return res.status(500).json({ message: "Failed to create MR note" });
  }
});

module.exports = router;
