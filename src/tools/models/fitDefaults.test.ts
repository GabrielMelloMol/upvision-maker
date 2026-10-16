import { afterEach, expect, test } from "vitest";
import { setFits } from "../../geometry/fits";
import { DEFAULT_SCREW_CASE } from "../../geometry/models/screwCase";
import { MODELS } from "./defs";

afterEach(() => setFits(null));
const estojo = () => MODELS.find((m) => m.id === "screwCase")!;

test("Estojo com rosca: sem folga validada vale a de fábrica; com ela, a que a pessoa escolheu no Kit de testes (#247)", () => {
  expect(estojo().liveDefaults!()).toEqual({});
  expect(estojo().defaults.clearance).toBe(DEFAULT_SCREW_CASE.clearance);
  setFits({ threadClearance: 0.4 });
  expect(estojo().liveDefaults!()).toEqual({ clearance: 0.4 });
});
