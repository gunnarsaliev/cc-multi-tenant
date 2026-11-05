import { defineMcpClientConnection } from "eve/connections";

import { ALLOWED_TOOLS, decideApproval, tenantKeyAuth } from "../lib/payload-mcp";
import { getServerURL } from "../lib/payload-session";

export default defineMcpClientConnection({
  approval: decideApproval,
  auth: tenantKeyAuth,
  description:
    "The website's content for the current organisation: search published content, read blog posts and pages, and translate a post into a draft.",
  tools: { allow: ALLOWED_TOOLS },
  url: `${getServerURL()}/api/mcp`,
});
