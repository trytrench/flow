import { describe, expect, test } from "vitest";
import { initNodeBuilder } from "../src";

async function fetchApi() {
  return {
    string: "string",
    number: 1,
  };
}

describe("Node Builder Test Suite", () => {
  test("Test dependency between nodes", async () => {
    const nodeBuilder = initNodeBuilder.create();

    const firstNode = nodeBuilder.resolver(() => {
      return fetchApi();
    });

    const secondNode = nodeBuilder
      .depend({
        first: firstNode,
        second: { third: { fourth: firstNode } },
      })
      .resolver(({ deps }) => {
        const { first } = deps;
        return {
          string2: first.string + "second",
          number2: first.number + 1,
        };
      });

    const result = await secondNode.run();
    expect(result.number2).toBe(2);
    expect(result.string2).toBe("stringsecond");
  });

  test("Test error handling in nodes", async () => {
    const nodeBuilder = initNodeBuilder.create();

    const errorNode = nodeBuilder.resolver(() => {
      throw new Error("Test error");
    });

    try {
      await errorNode.run();
    } catch (e) {
      expect(e.message).toBe("Test error");
    }
  });

  test("Test then system in nodes", async () => {
    const nodeBuilder = initNodeBuilder.create();

    const fetchNode = nodeBuilder.resolver(() => {
      return fetchApi();
    });

    const pluginNode = nodeBuilder
      .depend({
        first: fetchNode.then((res) => {
          return {
            string3: res.string + "third",
            number3: res.number + 2,
          };
        }),
      })
      .resolver(({ deps }) => {
        const { first } = deps;
        return first;
      });

    const result = await pluginNode.run();

    expect(result.number3).toBe(3);
    expect(result.string3).toBe("stringthird");
  });
});
