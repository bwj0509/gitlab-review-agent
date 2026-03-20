const express = require("express");
const crypto = require("crypto");

const {
  ALLOWED_ACTIONS,
  GITLAB_BOT_USERNAMES,
  GITLAB_REVIEW_MENTIONS,
  GITLAB_WEBHOOK_SECRET
} = require("../config/env");
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

  if (req.body?.object_kind === "merge_request") {
    return handleMergeRequestWebhook(req, res, requestId);
  }

  if (req.body?.object_kind === "note") {
    return handleNoteWebhook(req, res, requestId);
  }

  logInfo("gitlab_webhook_ignored_kind", {
    requestId,
    objectKind: req.body?.object_kind || null
  });
  return res.status(200).json({ message: "Ignored: unsupported event" });
});

async function handleMergeRequestWebhook(req, res, requestId) {
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
}

async function handleNoteWebhook(req, res, requestId) {
  const noteBody = req.body?.object_attributes?.note || "";
  const noteAction = req.body?.object_attributes?.action;
  const noteableType = req.body?.object_attributes?.noteable_type;
  const isSystemNote = Boolean(req.body?.object_attributes?.system);
  const authorUsername = req.body?.user?.username || "";
  const projectId = req.body?.project?.id;
  const mergeRequestIid =
    req.body?.merge_request?.iid ||
    req.body?.object_attributes?.noteable_iid ||
    req.body?.object_attributes?.iid;

  if (noteableType !== "MergeRequest") {
    logInfo("gitlab_note_ignored_type", {
      requestId,
      noteableType: noteableType || null
    });
    return res.status(200).json({ message: "Ignored: unsupported note type" });
  }

  if (noteAction && noteAction !== "create") {
    logInfo("gitlab_note_ignored_action", {
      requestId,
      noteAction
    });
    return res.status(200).json({ message: `Ignored: unsupported note action ${noteAction}` });
  }

  if (isSystemNote) {
    logInfo("gitlab_note_ignored_system", {
      requestId,
      projectId: projectId || null,
      mergeRequestIid: mergeRequestIid || null
    });
    return res.status(200).json({ message: "Ignored: system note" });
  }

  if (!projectId || !mergeRequestIid) {
    logError("gitlab_note_missing_identifiers", {
      requestId,
      projectId: projectId || null,
      mergeRequestIid: mergeRequestIid || null
    });
    return res.status(400).json({ message: "Missing project.id or merge request iid" });
  }

  if (GITLAB_BOT_USERNAMES.includes(authorUsername.toLowerCase())) {
    logInfo("gitlab_note_ignored_bot_author", {
      requestId,
      authorUsername
    });
    return res.status(200).json({ message: "Ignored: bot note" });
  }

  if (!containsReviewMention(noteBody)) {
    logInfo("gitlab_note_ignored_without_mention", {
      requestId,
      authorUsername,
      projectId,
      mergeRequestIid
    });
    return res.status(200).json({ message: "Ignored: no review mention" });
  }

  try {
    const mentionRequest = extractMentionRequest(noteBody);
    const responseMode = detectResponseMode(mentionRequest);
    logInfo("gitlab_note_review_requested", {
      requestId,
      authorUsername,
      projectId,
      mergeRequestIid,
      responseMode,
      mentionRequest: mentionRequest || null
    });
    await postReviewNote(projectId, mergeRequestIid, requestId, {
      responseMode,
      userRequest: mentionRequest
    });
    return res.status(200).json({ message: "Mention response note created" });
  } catch (error) {
    logError("gitlab_note_review_failed", {
      requestId,
      authorUsername,
      projectId,
      mergeRequestIid,
      message: error.message
    });
    return res.status(500).json({ message: "Failed to create mention review note" });
  }
}

function containsReviewMention(noteBody) {
  if (typeof noteBody !== "string" || GITLAB_REVIEW_MENTIONS.length === 0) {
    return false;
  }

  const normalizedNoteBody = noteBody.toLowerCase();
  return GITLAB_REVIEW_MENTIONS.some((mention) => normalizedNoteBody.includes(mention.toLowerCase()));
}

function extractMentionRequest(noteBody) {
  if (typeof noteBody !== "string") {
    return "";
  }

  let cleanedText = noteBody;
  for (const mention of GITLAB_REVIEW_MENTIONS) {
    cleanedText = replaceAllCaseInsensitive(cleanedText, mention, " ");
  }

  return cleanedText.replace(/\s+/g, " ").trim();
}

function detectResponseMode(mentionRequest) {
  if (!mentionRequest) {
    return "review";
  }

  const normalizedRequest = mentionRequest.toLowerCase();
  const reviewKeywords = ["코드리뷰", "리뷰", "검토", "진행해줘", "부탁", "봐줘", "확인해줘"];
  const questionSignals = ["문제", "파일", "부분", "이슈", "괜찮", "될지", "맞는지", "확인", "왜", "어떻게"];

  const hasQuestionSignal =
    questionSignals.some((signal) => normalizedRequest.includes(signal)) ||
    normalizedRequest.includes("?") ||
    /[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/.test(mentionRequest);
  const isLikelyGenericReview = reviewKeywords.some((keyword) => normalizedRequest.includes(keyword));

  return hasQuestionSignal && !isLikelyGenericReview ? "question" : "review";
}

function replaceAllCaseInsensitive(text, searchValue, replacement) {
  const escapedValue = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escapedValue, "gi"), replacement);
}

module.exports = router;
