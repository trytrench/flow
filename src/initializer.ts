import { NodeBuilder, createNodeBuilder } from "./nodeBuilder";
import { Parser, inferParser } from "./types/parser";

type NodeBuilderDef<TContext, TInput> = {
  parser: Parser | null;
  getContext: () => TContext;
};

export type NodeBuilderInitializer<TContext, TInput = undefined> = {
  _def: NodeBuilderDef<TContext, TInput>;
  context: <TC>(getContext: () => TC) => NodeBuilderInitializer<TC, TInput>;
  input: <TInput, TArgs extends [Parser] | [] = []>(
    ...args: TArgs
  ) => NodeBuilderInitializer<
    TContext,
    TArgs extends [Parser] ? inferParser<TArgs[0]>["out"] : TInput
  >;
  create: () => NodeBuilder<any, any, TContext, TInput>;
};

function createNewInitializer<TContext, TInput = undefined>(
  prevDef: NodeBuilderDef<any, any>,
  newDef: Partial<NodeBuilderDef<TContext, TInput>>
): NodeBuilderInitializer<TContext, TInput> {
  const def: NodeBuilderDef<TContext, TInput> = {
    ...prevDef,
    ...newDef,
  };

  return createInitializer(def);
}

export function createInitializer<TContext, TInput = undefined>(
  initDef?: Partial<NodeBuilderDef<TContext, TInput>>
): NodeBuilderInitializer<TContext, TInput> {
  const def: NodeBuilderDef<TContext, TInput> = {
    parser: null,
    getContext: () => ({} as any),
    ...initDef,
  };
  return {
    _def: def,
    context: <TC>(getContext: () => TC) =>
      createNewInitializer<TC, TInput>(def, { getContext }),
    input: <TIn, TArgs extends [Parser] | []>(...args: TArgs) =>
      createNewInitializer<
        TContext,
        TArgs extends [Parser] ? inferParser<TArgs[0]>["out"] : TIn
      >(def, {
        parser: args[0] ?? undefined,
      }),
    create: () => {
      return createNodeBuilder<any, any, TContext, TInput>({
        inputParser: def.parser,
        getContext: def.getContext,
      });
    },
  };
}
