const express = require("express");

const gitlabWebhookRouter = require("./routes/gitlabWebhook");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/webhook", gitlabWebhookRouter);

module.exports = app;
