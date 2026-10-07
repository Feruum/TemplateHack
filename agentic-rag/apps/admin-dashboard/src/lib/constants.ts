export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
export const AGENT_BASE_URL = process.env.NEXT_PUBLIC_AGENT_URL || "";

export const ADMIN_SERVICE_URL = "/api/admin";
export const AUTH_SERVICE_URL = "/api/auth";
export const AGENT_ENDPOINT = "/api/agent";

export const AGENT_API_V1 = `${AGENT_ENDPOINT}/api/v1`;
export const AGENT_INVOKE_URL = `${AGENT_ENDPOINT}/invoke`;
export const AGENT_STREAM_URL = `${AGENT_API_V1}/chat/stream`;
export const AGENT_HEALTH_URL = `${AGENT_ENDPOINT}/health`;
export const AGENT_MODELS_URL = `${AGENT_API_V1}/models`;
export const AGENT_STORAGE_URL = `${AGENT_API_V1}/storage/stats`;
export const AGENT_DOCUMENTS_URL = `${AGENT_API_V1}/documents`;
