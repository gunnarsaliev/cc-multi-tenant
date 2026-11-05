import { defineAgent } from "eve";

export default defineAgent({
  // This agent only works with CMS content, so it gets no shell or file tools.
  defaultTools: false,
  model: process.env.AI_AGENT_MODEL ?? "openai/gpt-6-luna-fast",
});
