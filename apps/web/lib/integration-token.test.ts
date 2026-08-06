import { describe, expect, it } from "vitest";
import { bearerToken } from "./integration-token";

describe("bearerToken", () => {
  it("reads the token from a Bearer authorization header", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer mtco_abc123" }))).toBe("mtco_abc123");
  });

  it("accepts the scheme in any case, as HTTP allows", () => {
    expect(bearerToken(new Headers({ authorization: "bearer mtco_abc123" }))).toBe("mtco_abc123");
  });

  it("refuses anything that is not a non-empty Bearer credential", () => {
    expect(bearerToken(new Headers())).toBeNull();
    expect(bearerToken(new Headers({ authorization: "mtco_abc123" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Basic mtco_abc123" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer    " }))).toBeNull();
  });
});
