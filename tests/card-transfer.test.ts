import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { pickColumn } = await import("@/lib/card-transfer");

const cols = [
  { id: "a", name: "À faire", kind: "TODO" as const },
  { id: "b", name: "En cours", kind: "DOING" as const },
  { id: "c", name: "Terminé", kind: "DONE" as const },
  { id: "d", name: "Bloqué", kind: "TODO" as const },
];

describe("pickColumn (where a transferred task lands)", () => {
  it("prefers the column with the same name", () => {
    expect(pickColumn({ name: "en cours", kind: "DOING" }, cols).id).toBe("b");
    expect(pickColumn({ name: "Bloqué", kind: "TODO" }, cols).id).toBe("d");
  });
  it("falls back to the same kind, then to the first column", () => {
    expect(pickColumn({ name: "Doing", kind: "DOING" }, cols).id).toBe("b");
    expect(pickColumn({ name: "Idées", kind: "TODO" }, cols).id).toBe("a");
    expect(pickColumn({ name: "Idées", kind: "DOING" }, [cols[0], cols[2]]).id).toBe("a");
  });
});
