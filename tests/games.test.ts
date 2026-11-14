import { describe, expect, it } from "vitest";
import { GAME_THREAD_PREFIX, isGameThread, NO_ACTIVE_GAME_MESSAGE } from "../src/bot/games.js";

const BOT = "bot-123";
const channel = (over: { thread?: boolean; ownerId?: string | null; name?: string } = {}) => ({
  isThread: () => over.thread ?? true,
  ownerId: over.ownerId === undefined ? BOT : over.ownerId,
  name: over.name ?? `${GAME_THREAD_PREFIX}Marssi → Pirkko`,
});

describe("isGameThread (katkenneiden pelien tunnistus)", () => {
  it("tunnistaa botin luoman peliketjun", () => {
    expect(isGameThread(channel(), BOT)).toBe(true);
  });

  it("ei reagoi tavallisiin kanaviin, muiden ketjuihin tai muihin botin ketjuihin", () => {
    expect(isGameThread(channel({ thread: false }), BOT)).toBe(false);
    expect(isGameThread(channel({ ownerId: "someone-else" }), BOT)).toBe(false);
    expect(isGameThread(channel({ ownerId: null }), BOT)).toBe(false);
    expect(isGameThread(channel({ name: "Yleinen keskustelu" }), BOT)).toBe(false);
  });

  it("ilmoitus kertoo, miten jatketaan", () => {
    expect(NO_ACTIVE_GAME_MESSAGE).toContain("/kauppa aloita");
  });
});
