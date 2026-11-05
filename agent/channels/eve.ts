import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { payloadSession } from "../lib/payload-session";

export default eveChannel({
  auth: [payloadSession, localDev()],
});
