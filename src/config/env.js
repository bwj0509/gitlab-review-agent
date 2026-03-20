require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL;
const GITLAB_BOT_TOKEN = process.env.GITLAB_BOT_TOKEN;
const GITLAB_WEBHOOK_SECRET = process.env.GITLAB_WEBHOOK_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "low";
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 3072);
const REVIEW_MAX_DIFF_CHARS = Number(process.env.REVIEW_MAX_DIFF_CHARS || 100000);
const REVIEW_CHUNK_MAX_CHARS = Number(process.env.REVIEW_CHUNK_MAX_CHARS || 35000);
const PREVIOUS_REVIEW_MAX_CHARS = Number(process.env.PREVIOUS_REVIEW_MAX_CHARS || 8000);
const QUESTION_EXTRA_CONTEXT_MAX_FILES = Number(process.env.QUESTION_EXTRA_CONTEXT_MAX_FILES || 3);
const OPENAI_API_BASE_URL = "https://api.openai.com/v1/responses";
const ALLOWED_ACTIONS = new Set(["open"]);
const AI_REVIEW_MARKER = "<!-- ai-review-bot -->";
const GITLAB_REVIEW_MENTIONS = parseCsvEnv(process.env.GITLAB_REVIEW_MENTIONS);
const GITLAB_BOT_USERNAMES = parseCsvEnv(process.env.GITLAB_BOT_USERNAMES).map((username) =>
  username.toLowerCase()
);

function parseCsvEnv(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  AI_REVIEW_MARKER,
  ALLOWED_ACTIONS,
  GITLAB_BOT_USERNAMES,
  GITLAB_BASE_URL,
  GITLAB_BOT_TOKEN,
  GITLAB_WEBHOOK_SECRET,
  GITLAB_REVIEW_MENTIONS,
  OPENAI_API_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_MAX_OUTPUT_TOKENS,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  PORT,
  PREVIOUS_REVIEW_MAX_CHARS,
  QUESTION_EXTRA_CONTEXT_MAX_FILES,
  REVIEW_CHUNK_MAX_CHARS,
  REVIEW_MAX_DIFF_CHARS
};
