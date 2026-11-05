import { defineEval } from "eve/evals";

export default defineEval({
  description: "Answers about content come from a search, not from the model's memory.",
  async test(t) {
    await t.send("What have we published about gardening?");
    t.succeeded();
    t.calledTool("payload__semanticSearch");
  },
});
