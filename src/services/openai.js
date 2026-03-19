const {
  OPENAI_API_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_MAX_OUTPUT_TOKENS,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT
} = require("../config/env");

async function generateReview(prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(OPENAI_API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: {
        effort: OPENAI_REASONING_EFFORT
      },
      input: prompt,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${responseText}`);
  }

  const data = await response.json();
  console.log(
    "OpenAI response summary:",
    JSON.stringify(
      {
        status: data.status,
        incomplete_details: data.incomplete_details || null,
        usage: data.usage || null,
        output_count: Array.isArray(data.output) ? data.output.length : 0,
        output_types: Array.isArray(data.output) ? data.output.map((item) => item.type) : []
      },
      null,
      2
    )
  );

  const text = extractResponseText(data);
  if (!text) {
    console.error("OpenAI raw response:", JSON.stringify(data, null, 2));
    throw new Error("OpenAI API returned an empty response");
  }

  return text;
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => {
      if (typeof content.text === "string") {
        return content.text;
      }

      return content?.text?.value || "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

module.exports = {
  generateReview
};
