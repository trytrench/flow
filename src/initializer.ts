import { StreamBuilder, createStreamBuilder } from "./streamBuilder";
import { Parser, inferParser } from "./types/parser";

type StreamBuilderDef<TContext, TInputParser extends Parser> = {
  parser: TInputParser | null;
  getContext: () => TContext;
};

export type StreamBuilderInitializer<TContext, TInputParser extends Parser> = {
  _def: StreamBuilderDef<TContext, TInputParser>;
  context: <TC>(
    getContext: () => TC
  ) => StreamBuilderInitializer<TC, TInputParser>;
  input: <TP extends Parser>(
    parser: TP
  ) => StreamBuilderInitializer<TContext, TP>;
  create: () => StreamBuilder<
    any,
    any,
    TContext,
    inferParser<TInputParser>["out"]
  >;
};

function createNewInitializer<TContext, TInputParser extends Parser>(
  prevDef: StreamBuilderDef<any, any>,
  newDef: Partial<StreamBuilderDef<TContext, TInputParser>>
): StreamBuilderInitializer<TContext, TInputParser> {
  const def: StreamBuilderDef<TContext, TInputParser> = {
    ...prevDef,
    ...newDef,
  };

  return createInitializer(def);
}

export function createInitializer<TContext, TInputParser extends Parser>(
  initDef?: Partial<StreamBuilderDef<TContext, TInputParser>>
): StreamBuilderInitializer<TContext, TInputParser> {
  const def: StreamBuilderDef<TContext, TInputParser> = {
    parser: null,
    getContext: () => ({} as any),
    ...initDef,
  };
  return {
    _def: def,
    context: <TC>(getContext: () => TC) =>
      createNewInitializer<TC, TInputParser>(def, { getContext }),
    input: <TP extends Parser>(parser: TP) =>
      createNewInitializer<TContext, TP>(def, {
        parser,
      }),
    create: () => {
      if (def.parser === null) {
        return createStreamBuilder<any, any, TContext, null>({
          getContext: def.getContext,
        });
      }
      return createStreamBuilder<any, any, TContext, TInputParser>({
        inputParser: def.parser,
        getContext: def.getContext,
      });
    },
  };
}
