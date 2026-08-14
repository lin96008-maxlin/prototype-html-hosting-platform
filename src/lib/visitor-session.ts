import { customAlphabet } from "nanoid";

export const VISITOR_COOKIE = "prototype_visitor";
const createVisitorId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 24);
const visitorPattern = /^[0-9A-Za-z]{24}$/;

export function resolveVisitorId(value: string | undefined) {
  return value && visitorPattern.test(value) ? value : createVisitorId();
}
