import type { AuthFn } from "eve/channels/auth";

type PayloadUser = {
  collection?: string;
  id: number;
  roles?: string[] | null;
  tenants?: { roles?: string[] | null; tenant: number | { id: number } }[] | null;
};

export const getServerURL = () =>
  process.env.PAYLOAD_PUBLIC_SERVER_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const readCookie = (header: string, name: string) =>
  header
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];

const tenantIDOf = ({ tenant }: { tenant: number | { id: number } }) =>
  typeof tenant === "object" ? tenant.id : tenant;

/**
 * Accepts a signed-in Payload user and pins the session to one tenant: the one selected in the
 * admin, or their only one. The selection is just a cookie, so it counts only if they belong to it.
 */
export const payloadSession: AuthFn<Request> = async (request) => {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return null;
  }

  const response = await fetch(`${getServerURL()}/api/users/me`, { headers: { cookie } });

  if (!response.ok) {
    return null;
  }

  const { user } = (await response.json()) as { user: null | PayloadUser };

  if (!user || user.collection !== "users") {
    return null;
  }

  const memberships = user.tenants ?? [];
  const isSuperAdmin = Boolean(user.roles?.includes("super-admin"));
  const selected = Number(readCookie(cookie, "payload-tenant"));
  const tenantID =
    Number.isInteger(selected) && selected > 0
      ? selected
      : memberships.length === 1
        ? tenantIDOf(memberships[0])
        : null;
  const membership = memberships.find((row) => tenantIDOf(row) === tenantID);

  if (tenantID === null || (!membership && !isSuperAdmin)) {
    return null;
  }

  return {
    attributes: {
      // eve attributes are strings.
      canEdit: isSuperAdmin || membership?.roles?.includes("tenant-admin") ? "true" : "false",
      tenantId: String(tenantID),
    },
    authenticator: "payload",
    principalId: String(user.id),
    principalType: "user",
  };
};
