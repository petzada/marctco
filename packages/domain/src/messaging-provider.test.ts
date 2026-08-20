import { describe, expect, it } from "vitest";
import {
  WHATSMIAU_API_BASE_URL,
  buildWhatsMiauSendTextRequest,
  classifySendTextFailure,
  whatsMiauDigitsFromE164
} from "./messaging-provider.js";

describe("whatsMiauDigitsFromE164", () => {
  it("converts a validated E.164 number to official digits without + or formatting", () => {
    expect(whatsMiauDigitsFromE164("+5511987654321")).toBe("5511987654321");
    expect(whatsMiauDigitsFromE164("+55 11 98765-4321")).toBe("5511987654321");
  });

  it("refuses a value that is not a personal E.164 number", () => {
    expect(whatsMiauDigitsFromE164("not-a-phone")).toBeNull();
    expect(whatsMiauDigitsFromE164("")).toBeNull();
  });
});

describe("buildWhatsMiauSendTextRequest", () => {
  const INSTANCE = "marctco_11111111111141118111111111111111";

  it("fixes the official v2 sendText contract and omits delay", () => {
    expect(WHATSMIAU_API_BASE_URL).toBe("https://api.whatsmiau.dev/v2");
    expect(
      buildWhatsMiauSendTextRequest({
        instance_name: INSTANCE,
        number: "551199998888",
        text: "Olá Maria, sou Ana da Assessoria."
      })
    ).toEqual({
      method: "POST",
      path: `/message/sendText/${INSTANCE}`,
      body: { number: "551199998888", text: "Olá Maria, sou Ana da Assessoria." }
    });
  });

  it("does not put delay, linkPreview or quoted on the official body", () => {
    const request = buildWhatsMiauSendTextRequest({
      instance_name: INSTANCE,
      number: "551199998888",
      text: "Olá"
    });
    expect(Object.keys(request.body).sort()).toEqual(["number", "text"]);
  });
});

describe("classifySendTextFailure", () => {
  it("treats 4xx as a known refusal and everything else as uncertain", () => {
    expect(classifySendTextFailure({ kind: "http_error", status: 400 })).toBe("KNOWN_REFUSAL");
    expect(classifySendTextFailure({ kind: "http_error", status: 404 })).toBe("KNOWN_REFUSAL");
    expect(classifySendTextFailure({ kind: "http_error", status: 500 })).toBe("UNCERTAIN_EXTERNAL");
    expect(classifySendTextFailure({ kind: "timeout" })).toBe("UNCERTAIN_EXTERNAL");
    expect(classifySendTextFailure({ kind: "network" })).toBe("UNCERTAIN_EXTERNAL");
  });
});
