import type { PrivateJtcService } from "./private-jtc-service.js";

let activePrivateJtcService: PrivateJtcService | null = null;

export const setPrivateJtcService = (
  service: PrivateJtcService | null,
): void => {
  activePrivateJtcService = service;
};

export const getPrivateJtcService = (): PrivateJtcService | null => {
  return activePrivateJtcService;
};
