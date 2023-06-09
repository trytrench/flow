import { nanoid } from "nanoid";
import { MaybePromise, deepset } from "./utils";
import { Parser } from "./types/parser";

export type StreamDepsTree = {
  [key: string]: StreamDepsTree | Stream<any, any, any, any>;
};

export type StreamOutputPayload<T> =
  | {
      success: true;
      result: T;
      error?: never;
    }
  | {
      success: false;
      result?: never;
      error: string;
    };

export type inferTreeValue<
  TDep extends StreamDepsTree | Stream<any, any, any, any>
> = TDep extends Stream<any, infer TStreamOutput, any, any>
  ? TStreamOutput
  : TDep extends StreamDepsTree
  ? {
      [key in keyof TDep]: StreamOutputPayload<inferTreeValue<TDep[key]>>;
    }
  : never;

export type ResolverOptions<TDeps extends StreamDepsTree, TContext, TInput> = {
  ctx: TContext;
  input: TInput;
  deps: {
    [key in keyof TDeps]: inferTreeValue<TDeps[key]>;
  };
};

export type StreamArtifacts<TDeps extends StreamDepsTree> = {
  lastRun: Date;
  results: ResultsTree<TDeps>;
};

export interface StreamDef<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
> {
  id: string;
  inputParser: Parser | null;
  getContext: () => TContext;
  deps: TDeps;
  resolver: (
    opts: ResolverOptions<TDeps, TContext, TInput>
  ) => MaybePromise<TOutput>;
  artifacts: StreamArtifacts<TDeps> | null;
}

export interface StreamBuilder<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
> {
  _def: StreamDef<TDeps, TOutput, TContext, TInput>;
  depend<TDepsArg extends StreamDepsTree>(
    deps: TDepsArg
  ): StreamBuilder<TDepsArg, TOutput, TContext, TInput>;
  resolver<TOut>(
    resolver: (
      opts: ResolverOptions<TDeps, TContext, TInput>
    ) => MaybePromise<TOut>
  ): Stream<TDeps, TOut, TContext, TInput>;

  plugin<TPluginInput, TPluginOutput>(props: {
    feedInput: (
      opts: ResolverOptions<TDeps, TContext, TInput>
    ) => MaybePromise<TPluginInput>;
    plugin: (input: TPluginInput) => MaybePromise<TPluginOutput>;
  }): Stream<TDeps, TPluginOutput, TContext, TInput>;
}

export type inferResultsTreeValue<
  TDep extends StreamDepsTree | Stream<any, any, any, any>
> = TDep extends Stream<any, infer TStreamOutput, any, any>
  ? StreamOutputPayload<TStreamOutput>
  : TDep extends StreamDepsTree
  ? {
      [key in keyof TDep]: StreamOutputPayload<inferTreeValue<TDep[key]>>;
    }
  : never;

export type ResultsTree<TDeps extends StreamDepsTree> = {
  [key in keyof TDeps]: inferResultsTreeValue<TDeps[key]>;
};

export interface Stream<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
> {
  run: (input: TInput) => Promise<TOutput>;
  getArtifacts: () => StreamArtifacts<TDeps> | null;
  _def: StreamDef<TDeps, TOutput, TContext, TInput>;
  _stream: true;
}

function createNewStreamBuilder<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
>(
  prevDef: StreamDef<any, any, any, any>,
  newDef: Partial<StreamDef<TDeps, TOutput, TContext, TInput>>
): StreamBuilder<TDeps, TOutput, TContext, TInput> {
  return createStreamBuilder<TDeps, TOutput, TContext, TInput>({
    ...prevDef,
    ...newDef,
  });
}

export function createStreamBuilder<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
>(
  initDef: Partial<StreamDef<any, any, any, any>> = {}
): StreamBuilder<TDeps, TOutput, TContext, TInput> {
  const _def: StreamDef<TDeps, TOutput, TContext, TInput> = {
    deps: {},
    id: "[none]",
    getContext: () => ({} as any),
    inputParser: null,
    resolver: async () => ({} as any),
    artifacts: null,
    ...initDef,
  };

  return {
    _def,
    depend(deps) {
      return createNewStreamBuilder(_def, {
        deps,
      });
    },
    resolver(resolver) {
      const finalBuilder = createNewStreamBuilder(_def, {
        resolver: resolver,
        id: nanoid(),
      });

      return {
        _stream: true,
        _def: finalBuilder._def,
        run: createStreamRunner(finalBuilder._def),
        getArtifacts: () => finalBuilder._def.artifacts,
      };
    },
    plugin({ feedInput, plugin }) {
      const finalBuilder = createNewStreamBuilder<TDeps, any, TContext, TInput>(
        _def,
        {
          resolver: async (opts) => {
            const pluginInput = await feedInput(opts);
            const output = await plugin(pluginInput);
            return output;
          },
          id: nanoid(),
        }
      );

      // console.log(finalBuilder._def);
      return {
        _stream: true,
        _def: finalBuilder._def,
        run: createStreamRunner(finalBuilder._def),
        getArtifacts: () => finalBuilder._def.artifacts,
      };
    },
  };
}

function flattenDeps<TDeps extends StreamDepsTree>(
  deps: TDeps
): StreamDef<any, any, any, any>[] {
  return Object.values(deps).flatMap((dep) => {
    if (dep._stream) {
      const stream = dep as Stream<any, any, any, any>;
      return [stream._def] as StreamDef<any, any, any, any>[];
    } else {
      const map = dep as StreamDepsTree;
      return flattenDeps(map);
    }
  });
}

function createDepsMap<TDeps extends StreamDepsTree>(
  deps: TDeps
): Record<string, StreamDef<any, any, any, any>> {
  const flatDeps = flattenDeps(deps);
  return Object.fromEntries(flatDeps.map((dep) => [dep.id, dep]));
}

function getAllDepsMap<TDeps extends StreamDepsTree>(
  deps: TDeps
): Record<string, StreamDef<any, any, any, any>> {
  // Get the deps, and deps of deps, and deps of deps of deps, etc.
  const allDepsMap = createDepsMap(deps);

  const depsOfDeps = Object.values(allDepsMap).map((dep) => {
    if (Object.keys(dep.deps).length === 0) {
      return {};
    } else {
      return getAllDepsMap(dep.deps);
    }
  });

  for (const dep of depsOfDeps) {
    Object.assign(allDepsMap, dep);
  }

  return allDepsMap;
}

export function createStreamRunner<
  TDeps extends StreamDepsTree,
  TOutput,
  TContext,
  TInput
>(streamDef: StreamDef<TDeps, TOutput, TContext, TInput>) {
  const finalStreamId = streamDef.id;

  // Gather all the deps into map
  const allStreamsMap = getAllDepsMap(streamDef.deps);
  allStreamsMap[finalStreamId] = streamDef;

  // Calculate the topological order of the streams
  const streamIdToTopoLevel: Record<string, number> = {};

  while (
    Object.keys(streamIdToTopoLevel).length < Object.keys(allStreamsMap).length
  ) {
    Object.values(allStreamsMap).forEach((stream) => {
      if (streamIdToTopoLevel[stream.id] !== undefined) {
        return;
      }

      const depsMap = createDepsMap(stream.deps);
      const depsList = Object.values(depsMap);

      if (depsList.length === 0) {
        streamIdToTopoLevel[stream.id] = 0;
        return;
      }

      // If all of the deps are already in the map, then we can calculate the topo level
      if (depsList.every((dep) => streamIdToTopoLevel[dep.id] !== undefined)) {
        const maxDepLevel = Math.max(
          ...depsList.map((dep) => streamIdToTopoLevel[dep.id])
        );
        streamIdToTopoLevel[stream.id] = maxDepLevel + 1;
      }
    });
  }

  return async (input: TInput): Promise<TOutput> => {
    const sortedStreams = Object.values(allStreamsMap).sort(
      (a, b) => streamIdToTopoLevel[a.id] - streamIdToTopoLevel[b.id]
    );

    const streamOutputMap: Record<string, StreamOutputPayload<any>> = {};

    for (const stream of sortedStreams) {
      const loadDeps = (deps: StreamDepsTree): Record<string, any> => {
        return Object.fromEntries(
          Object.entries(deps).map(([key, dep]) => {
            if (dep._stream) {
              const t = dep as Stream<any, any, any, any>;
              const result = streamOutputMap[t._def.id].result ?? null;
              return [key, result];
            } else {
              const map = dep as StreamDepsTree;
              return [key, loadDeps(map)];
            }
          })
        );
      };

      const depInputs = loadDeps(stream.deps);

      try {
        streamOutputMap[stream.id] = {
          success: true,
          result: await stream.resolver({
            ctx: stream.getContext(),
            deps: depInputs,
            input,
          }),
        };
      } catch (e: any) {
        streamOutputMap[stream.id] = {
          success: false,
          error: e.message ?? "Unknown error",
        };
      }
    }

    let resultTree: ResultsTree<TDeps> = {} as any;

    const iterate = (keys: string[], obj: StreamDepsTree) => {
      Object.entries(obj).forEach(([key, value]) => {
        const newKeys = [...keys, key];
        if (value._stream) {
          const t = value as Stream<any, any, any, any>;
          resultTree = deepset(
            resultTree,
            newKeys,
            streamOutputMap[t._def.id] ?? null
          ) as ResultsTree<TDeps>;
        } else {
          const map = value as StreamDepsTree;
          iterate(newKeys, map);
        }
      });
    };
    iterate([], streamDef.deps);

    streamDef.artifacts = {
      lastRun: new Date(),
      results: resultTree,
    };

    const res = streamOutputMap[finalStreamId];
    if (res.success) {
      return res.result;
    } else {
      throw new Error(res.error);
    }
  };
}
