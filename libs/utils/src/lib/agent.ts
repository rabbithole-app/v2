export interface ParsedAgentError {
  canisterId: string | null;
  errorCode: string | null;
  method: string | null;
  rejectCode: string | null;
  rejectMessage: string | null;
  requestId: string | null;
}

const unescapeString = (str: string): string => {
  try {
    return JSON.parse(`"${str}"`);
  } catch {
    return str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
};

export function parseAgentError(errorText: string) {
  const canisterIdMatch = errorText.match(/Canister:\s*([a-z0-9-]+)/i);
  const methodMatch = errorText.match(/Method:\s*([^\n(]+)/i);
  const requestIdMatch = errorText.match(/"Request ID":\s*"([^"]+)"/i);
  const errorCodeMatch = errorText.match(/"Error code":\s*"([^"]+)"/i);
  const rejectCodeMatch = errorText.match(/"Reject code":\s*"([^"]+)"/i);
  const rejectMessageMatch = errorText.match(
    /"Reject message":\s*"((?:[^"\\]|\\.)*)"/i
  );

  return {
    canisterId: canisterIdMatch?.[1] || null,
    method: methodMatch?.[1].trim() || null,
    requestId: requestIdMatch?.[1] || null,
    errorCode: errorCodeMatch?.[1] || null,
    rejectCode: rejectCodeMatch?.[1] || null,
    rejectMessage: rejectMessageMatch?.[1]
      ? unescapeString(rejectMessageMatch[1])
      : null,
  };
}
