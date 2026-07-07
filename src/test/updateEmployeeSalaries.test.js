import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de Supabase antes de importar la función
vi.mock("../supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "../supabase";
import { updateEmployeeSalaries } from "../components/metricas/metricsApi";

function makeChain(result = { error: null }) {
  const chain = { update: vi.fn(), eq: vi.fn() };
  chain.update.mockReturnValue(chain);
  chain.eq.mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateEmployeeSalaries", () => {
  it("con array vacío no llama a Supabase y retorna { error: null }", async () => {
    const result = await updateEmployeeSalaries([]);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null });
  });

  it("hace un UPDATE por fila con el user_id y monto correctos", async () => {
    const chain1 = makeChain({ error: null });
    const chain2 = makeChain({ error: null });
    supabase.from
      .mockReturnValueOnce(chain1)
      .mockReturnValueOnce(chain2);

    const rows = [
      { user_id: "u1", monto: 200 },
      { user_id: "u2", monto: 350 },
    ];
    const result = await updateEmployeeSalaries(rows);

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(chain1.update).toHaveBeenCalledWith({ monthly_salary: 200 });
    expect(chain1.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(chain2.update).toHaveBeenCalledWith({ monthly_salary: 350 });
    expect(chain2.eq).toHaveBeenCalledWith("user_id", "u2");
    expect(result).toEqual({ error: null });
  });

  it("ante el primer error lo retorna y no continúa con las filas siguientes", async () => {
    const fakeError = new Error("RLS denied");
    const chain1 = makeChain({ error: fakeError });
    supabase.from.mockReturnValueOnce(chain1);

    const rows = [
      { user_id: "u1", monto: 200 },
      { user_id: "u2", monto: 350 }, // no debe ejecutarse
    ];
    const result = await updateEmployeeSalaries(rows);

    expect(supabase.from).toHaveBeenCalledTimes(1); // se detuvo en la primera
    expect(result).toEqual({ error: fakeError });
  });
});
