import { createConnectTransport } from "@connectrpc/connect-web";
import { ADMIN_SERVICE_URL } from "./constants";

export const transport = createConnectTransport({
  baseUrl: ADMIN_SERVICE_URL,
});
