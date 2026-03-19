const fs = require("fs");
const path = require("path");

const LOG_DIR_PATH = path.join(process.cwd(), "logs");
const LOG_FILE_PATH = path.join(LOG_DIR_PATH, "app.log");

function logInfo(event, context = {}) {
  writeLog("info", event, context);
}

function logError(event, context = {}) {
  writeLog("error", event, context);
}

function writeLog(level, event, context) {
  ensureLogDir();

  const logEntry = {
    time: new Date().toISOString(),
    level,
    event,
    ...context
  };

  fs.appendFile(LOG_FILE_PATH, `${JSON.stringify(logEntry)}\n`, (error) => {
    if (error) {
      console.error("Failed to write app log", error);
    }
  });
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR_PATH)) {
    fs.mkdirSync(LOG_DIR_PATH, { recursive: true });
  }
}

module.exports = {
  logError,
  logInfo
};
