import type { JtcService } from "./jtc-service.js";

let activeJtcService: JtcService | null = null;

export const setJtcService = (service: JtcService | null): void => {
  activeJtcService = service;
};

export const getJtcService = (): JtcService | null => {
  return activeJtcService;
};
