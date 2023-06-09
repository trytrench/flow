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
