import { describe, expect, test } from "vitest";
import { initStreamBuilder } from "../src";

async function fetchApi() {
  return {
    string: "string",
    number: 1,
  };
}

describe("Stream Builder Test Suite", () => {
  test("Test dependency between streams", async () => {
    const streamBuilder = initStreamBuilder.create();

    const firstStream = streamBuilder.resolver(() => {
      return fetchApi();
    });

    const secondStream = streamBuilder
      .depend({ first: firstStream })
      .resolver(({ deps }) => {
        const { first } = deps;
        return {
          string2: first.string + "second",
          number2: first.number + 1,
        };
      });

    const result = await secondStream.run(null);
    expect(result.number2).toBe(2);
    expect(result.string2).toBe("stringsecond");
  });

  test("Test error handling in streams", async () => {
    const streamBuilder = initStreamBuilder.create();

    const errorStream = streamBuilder.resolver(() => {
      throw new Error("Test error");
    });

    try {
      await errorStream.run(null);
    } catch (e) {
      expect(e.message).toBe("Test error");
    }
  });

  test("Test plugin system in streams", async () => {
    const streamBuilder = initStreamBuilder.create();

    const fetchStream = streamBuilder.resolver(() => {
      return fetchApi();
    });

    const pluginStream = streamBuilder.depend({ first: fetchStream }).plugin({
      feedInput: async (opts) => opts.deps.first,
      plugin: async (input) => {
        return {
          string3: input.string + "third",
          number3: input.number + 2,
        };
      },
    });

    const result = await pluginStream.run(null);

    expect(result.number3).toBe(3);
    expect(result.string3).toBe("stringthird");
  });
});
