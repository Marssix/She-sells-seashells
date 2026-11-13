import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { CLIENT_OPTIONS, toBuyerError } from "../src/ai/buyer.js";

const apiError = (status: number, message = "virhe") => Anthropic.APIError.generate(status, { error: { message } }, message, new Headers());

describe("toBuyerError", () => {
  it("palvelinhäiriö (esim. 503 credential validation failed) on tilapäinen ja selkokielinen", () => {
    const e = toBuyerError(apiError(503, "503 credential validation failed"));
    expect(e.retryable).toBe(true);
    expect(e.message).toContain("hetkellinen häiriö");
    expect(e.message).not.toContain("503");
    expect(e.detail).toContain("503");
  });

  it("verkkovirhe on tilapäinen", () => {
    const e = toBuyerError(new Anthropic.APIConnectionError({ message: "socket hang up" }));
    expect(e.retryable).toBe(true);
    expect(e.message).toContain("hetkellinen häiriö");
  });

  it("väärä avain ei ole tilapäinen ja ohjaa ylläpitäjälle", () => {
    const e = toBuyerError(apiError(401));
    expect(e.retryable).toBe(false);
    expect(e.message).toContain("API-avain");
  });

  it("ruuhka pyytää odottamaan", () => {
    const e = toBuyerError(apiError(429));
    expect(e.retryable).toBe(true);
    expect(e.message).toContain("ruuhkautunut");
  });

  it("virheellinen pyyntö ei ole tilapäinen", () => {
    expect(toBuyerError(apiError(400)).retryable).toBe(false);
  });

  it("tuntematon virhe säilyttää teknisen syyn lokia varten", () => {
    const e = toBuyerError(new Error("Could not resolve authentication method"));
    expect(e.detail).toBe("Could not resolve authentication method");
    expect(e.message).not.toContain("authentication");
  });

  it("asiakas yrittää uudelleen useammin kuin SDK:n oletus (2)", () => {
    expect(CLIENT_OPTIONS.maxRetries).toBeGreaterThan(2);
  });
});
