const { REVIEW_MAX_DIFF_CHARS } = require("../config/env");

function formatChangesForPrompt(changes) {
  if (changes.length === 0) {
    return "변경된 파일이 없습니다.";
  }

  const fullDiff = changes
    .map((change) => {
      return [
        `FILE: ${change.old_path} -> ${change.new_path}`,
        `NEW FILE: ${Boolean(change.new_file)}`,
        `RENAMED: ${Boolean(change.renamed_file)}`,
        `DELETED: ${Boolean(change.deleted_file)}`,
        "DIFF:",
        change.diff || "(diff not available)"
      ].join("\n");
    })
    .join("\n\n");

  if (fullDiff.length <= REVIEW_MAX_DIFF_CHARS) {
    return fullDiff;
  }

  return `${fullDiff.slice(0, REVIEW_MAX_DIFF_CHARS)}\n\n[diff truncated due to size limit]`;
}

module.exports = {
  formatChangesForPrompt
};
