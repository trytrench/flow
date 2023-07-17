export type MaybePromise<TType> = TType | Promise<TType>;

type DeepSetObject = Record<string, unknown>;

export function deepset(
  obj: DeepSetObject,
  paths: string[],
  value: any
): DeepSetObject {
  paths.reduce((prev: DeepSetObject, curr: string, i: number) => {
    if (i === paths.length - 1) {
      prev[curr] = value;
    } else {
      prev[curr] = prev[curr] || {};
    }
    return prev[curr] as DeepSetObject;
  }, obj);
  return obj;
}

function createIdGenerator(): () => string {
  function* idGenerator(): Generator<number> {
    let id = 1;
    while (true) {
      yield id++;
    }
  }

  const gen = idGenerator();

  return () => gen.next().value.toString();
}

export const genId = createIdGenerator();
