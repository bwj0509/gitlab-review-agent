const { QUESTION_EXTRA_CONTEXT_MAX_FILES } = require("../config/env");

function collectQuestionContext({ changes, getFileContent, userRequest }) {
  const fileHints = extractFileHints(userRequest).slice(0, QUESTION_EXTRA_CONTEXT_MAX_FILES);
  if (fileHints.length === 0) {
    return createEmptyContext();
  }

  const targetPaths = resolveTargetPaths(changes, fileHints).slice(0, QUESTION_EXTRA_CONTEXT_MAX_FILES);
  if (targetPaths.length === 0) {
    return createEmptyContext();
  }

  return buildQuestionContext({ getFileContent, targetPaths, userRequest });
}

async function buildQuestionContext({ getFileContent, targetPaths, userRequest }) {
  const files = [];

  for (const path of targetPaths) {
    const content = await getFileContent(path);
    if (!content) {
      continue;
    }

    files.push({
      content: formatFullContent(content),
      path,
      reason: "directly mentioned in the question"
    });
  }

  if (files.length === 0) {
    return createEmptyContext();
  }

  return {
    files,
    text: formatContextText(files)
  };
}

function resolveTargetPaths(changes, fileHints) {
  const uniqueHints = dedupeHints(fileHints);
  const changePaths = changes
    .map((change) => change.new_path || change.old_path || "")
    .filter(Boolean)
    .filter((filePath, index, paths) => paths.indexOf(filePath) === index);

  const resolvedPaths = [];

  for (const hint of uniqueHints) {
    const exactMatch = changePaths.find((filePath) => normalizePath(filePath) === hint.normalized);
    if (exactMatch) {
      resolvedPaths.push(exactMatch);
      continue;
    }

    const partialMatch = changePaths.find((filePath) => normalizePath(filePath).includes(hint.normalized));
    if (partialMatch) {
      resolvedPaths.push(partialMatch);
      continue;
    }

    resolvedPaths.push(hint.raw);
  }

  return resolvedPaths.filter((filePath, index, paths) => paths.indexOf(filePath) === index);
}

function extractFileHints(userRequest) {
  if (typeof userRequest !== "string") {
    return [];
  }

  return [...userRequest.matchAll(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g)].map((match) => sanitizeRawPath(match[0]));
}

function normalizePath(filePath) {
  return String(filePath || "").trim().replace(/\\/g, "/").toLowerCase();
}

function sanitizeRawPath(filePath) {
  return String(filePath || "").trim().replace(/\\/g, "/").replace(/^['"`]+|['"`.,:;!?]+$/g, "");
}

function dedupeHints(fileHints) {
  const dedupedHints = [];

  for (const rawHint of fileHints) {
    const raw = sanitizeRawPath(rawHint);
    const normalized = normalizePath(raw);
    if (!raw || dedupedHints.some((hint) => hint.normalized === normalized)) {
      continue;
    }

    dedupedHints.push({ raw, normalized });
  }

  return dedupedHints;
}

function formatContextText(files) {
  return files
    .map((file) =>
      [`FILE: ${file.path}`, `Reason: ${file.reason}`, "Full content:", file.content].join("\n")
    )
    .join("\n\n---\n\n");
}

function formatFullContent(content) {
  return String(content).trim();
}

function createEmptyContext() {
  return {
    files: [],
    text: ""
  };
}

module.exports = {
  collectQuestionContext
};
