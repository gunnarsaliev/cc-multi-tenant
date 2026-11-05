import type { AuthorizationDefinition, ConnectionPrincipal } from "eve/connections";

/** The bare names of the MCP tools this agent may discover. */
export const ALLOWED_TOOLS = ["semanticSearch", "findBlog", "findPages", "translatePost"];

/** Each tenant has a service user with its own MCP key: `{"<tenant id>": "<key>"}`. */
const getKey = (tenantID: string) => {
  const keys = JSON.parse(process.env.PAYLOAD_MCP_KEYS ?? "{}") as Record<string, string>;
  const key = keys[tenantID];

  if (!key) {
    throw new Error("This tenant has no MCP key configured.");
  }

  return key;
};

/** The tenant comes from verified route auth, never from the prompt or a tool argument. */
export const tenantKeyAuth: AuthorizationDefinition = {
  getToken: async ({ principal }: { principal: ConnectionPrincipal }) => {
    const tenantID = principal.type === "user" ? principal.attributes?.tenantId : undefined;

    if (typeof tenantID !== "string") {
      throw new Error("An authenticated tenant user is required.");
    }

    return { token: getKey(tenantID) };
  },
  principalType: "user",
};

type ApprovalInput = {
  session: { auth: { current?: null | { attributes?: Record<string, unknown> } } };
  toolName: string;
};

/**
 * All of a tenant's callers share one service user, so MCP can't tell a viewer from an admin.
 * Writing is decided here: viewers are refused, and admins confirm each translation.
 */
export const decideApproval = ({ session, toolName }: ApprovalInput) => {
  if (!toolName.endsWith("translatePost")) {
    return "not-applicable" as const;
  }

  return session.auth.current?.attributes?.canEdit === "true"
    ? ("user-approval" as const)
    : ("denied" as const);
};
