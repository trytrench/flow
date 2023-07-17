import { MaybePromise, deepset, genId } from "./utils";
import { Parser } from "./types/parser";

export type NodeDepsTree = {
  [key: string]: NodeDepsTree | Node<any, any, any, any>;
};

export type NodeOutputPayload<T> =
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
  TDep extends NodeDepsTree | Node<any, any, any, any>
> = TDep extends Node<any, infer TNodeOutput, any, any>
  ? TNodeOutput
  : TDep extends NodeDepsTree
  ? {
      [key in keyof TDep]: inferTreeValue<TDep[key]>;
    }
  : never;

export type ResolverOptions<TDeps extends NodeDepsTree, TContext, TInput> = {
  ctx: TContext;
  input: TInput;
  deps: {
    [key in keyof TDeps]: inferTreeValue<TDeps[key]>;
  };
};

export type NodeArtifacts<TDeps extends NodeDepsTree> = {
  lastRun: Date;
  results: ResultsTree<TDeps>;
};

export interface NodeDef<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
> {
  id: string;
  inputParser: Parser | null;
  getContext: () => TContext;
  deps: TDeps;
  resolver: (
    opts: ResolverOptions<TDeps, TContext, TInput>
  ) => MaybePromise<TOutput>;
  artifacts: NodeArtifacts<TDeps> | null;
}

export interface NodeBuilder<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
> {
  _def: NodeDef<TDeps, TOutput, TContext, TInput>;
  depend<TDepsArg extends NodeDepsTree>(
    deps: TDepsArg
  ): NodeBuilder<TDepsArg, TOutput, TContext, TInput>;
  resolver<TOut>(
    resolver: (
      opts: ResolverOptions<TDeps, TContext, TInput>
    ) => MaybePromise<TOut>
  ): Node<TDeps, TOut, TContext, TInput>;
}

export type inferResultsTreeValue<
  TDep extends NodeDepsTree | Node<any, any, any, any>
> = TDep extends Node<any, infer TNodeOutput, any, any>
  ? NodeOutputPayload<TNodeOutput>
  : TDep extends NodeDepsTree
  ? {
      [key in keyof TDep]: NodeOutputPayload<inferTreeValue<TDep[key]>>;
    }
  : never;

export type ResultsTree<TDeps extends NodeDepsTree> = {
  [key in keyof TDeps]: inferResultsTreeValue<TDeps[key]>;
};

export type NodeThen<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
> = <TOut>(
  resolver: (res: TOutput) => MaybePromise<TOut>
) => Node<TDeps, TOut, TContext, TInput>;

export interface Node<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
> {
  run: (...args: TInput extends undefined ? [] : [TInput]) => Promise<TOutput>;
  getArtifacts: () => NodeArtifacts<TDeps> | null;
  then: NodeThen<TDeps, TOutput, TContext, TInput>;
  _def: NodeDef<TDeps, TOutput, TContext, TInput>;
  _node: true;
}

function createNewNodeBuilder<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput
>(
  prevDef: NodeDef<any, any, any, any>,
  newDef: Partial<NodeDef<TDeps, TOutput, TContext, TInput>>
): NodeBuilder<TDeps, TOutput, TContext, TInput> {
  return createNodeBuilder<TDeps, TOutput, TContext, TInput>({
    ...prevDef,
    ...newDef,
  });
}

export type inferNodeOutput<T> = T extends Node<any, infer TOut, any, any>
  ? TOut
  : never;

export function createNodeBuilder<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
>(
  initDef: Partial<NodeDef<any, any, any, any>> = {}
): NodeBuilder<TDeps, TOutput, TContext, TInput> {
  const _def: NodeDef<TDeps, TOutput, TContext, TInput> = {
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
      return createNewNodeBuilder(_def, {
        deps,
      });
    },
    resolver(resolver) {
      const finalBuilder = createNewNodeBuilder(_def, {
        resolver: resolver,
        id: genId(),
      });

      return createNodeFromDef(finalBuilder._def);
    },
  };
}

function flattenDeps<TDeps extends NodeDepsTree>(
  deps: TDeps
): NodeDef<any, any, any, any>[] {
  return Object.values(deps).flatMap((dep) => {
    if (dep._node) {
      const node = dep as Node<any, any, any, any>;
      return [node._def] as NodeDef<any, any, any, any>[];
    } else {
      const map = dep as NodeDepsTree;
      return flattenDeps(map);
    }
  });
}

function createDepsMap<TDeps extends NodeDepsTree>(
  deps: TDeps
): Record<string, NodeDef<any, any, any, any>> {
  const flatDeps = flattenDeps(deps);
  return Object.fromEntries(flatDeps.map((dep) => [dep.id, dep]));
}

function getAllDepsMap<TDeps extends NodeDepsTree>(
  deps: TDeps
): Record<string, NodeDef<any, any, any, any>> {
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

function createNodeRunner<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput
>(nodeDef: NodeDef<TDeps, TOutput, TContext, TInput>) {
  const finalNodeId = nodeDef.id;

  // Gather all the deps into map
  const allNodesMap = getAllDepsMap(nodeDef.deps);
  allNodesMap[finalNodeId] = nodeDef;

  // Calculate the topological order of the nodes
  const nodeIdToTopoLevel: Record<string, number> = {};

  while (
    Object.keys(nodeIdToTopoLevel).length < Object.keys(allNodesMap).length
  ) {
    Object.values(allNodesMap).forEach((node) => {
      if (nodeIdToTopoLevel[node.id] !== undefined) {
        return;
      }

      const depsMap = createDepsMap(node.deps);
      const depsList = Object.values(depsMap);

      if (depsList.length === 0) {
        nodeIdToTopoLevel[node.id] = 0;
        return;
      }

      // If all of the deps are already in the map, then we can calculate the topo level
      if (depsList.every((dep) => nodeIdToTopoLevel[dep.id] !== undefined)) {
        const maxDepLevel = Math.max(
          ...depsList.map((dep) => nodeIdToTopoLevel[dep.id])
        );
        nodeIdToTopoLevel[node.id] = maxDepLevel + 1;
      }
    });
  }

  return async (
    ...args: TInput extends undefined ? [] : [TInput]
  ): Promise<TOutput> => {
    const input = args[0] ?? null;

    const sortedNodes = Object.values(allNodesMap).sort(
      (a, b) => nodeIdToTopoLevel[a.id] - nodeIdToTopoLevel[b.id]
    );

    const nodeOutputMap: Record<string, NodeOutputPayload<any>> = {};
    const nodePromiseMap: Record<string, Promise<any>> = {};

    const loadDeps = (deps: NodeDepsTree): Record<string, any> => {
      return Object.fromEntries(
        Object.entries(deps).map(([key, dep]) => {
          if (dep._node) {
            const t = dep as Node<any, any, any, any>;
            const result = nodeOutputMap[t._def.id].result ?? null;
            return [key, result];
          } else {
            const map = dep as NodeDepsTree;
            return [key, loadDeps(map)];
          }
        })
      );
    };

    const getPromisesToWaitFor = (deps: NodeDepsTree): Promise<any>[] => {
      const allDeps = Object.values(deps).flatMap((dep) => {
        if (dep._node) {
          const t = dep as Node<any, any, any, any>;
          // may need to check if null first
          // it would be null with a cyclical dependency, for example.
          return [nodePromiseMap[t._def.id]];
        } else {
          const map = dep as NodeDepsTree;
          return getPromisesToWaitFor(map);
        }
      });

      // Remove duplicates
      return [...new Set(allDeps)];
    };

    for (const node of sortedNodes) {
      nodePromiseMap[node.id] = Promise.allSettled(
        getPromisesToWaitFor(node.deps)
      ).then(async (res) => {
        try {
          const depInputs = loadDeps(node.deps);

          nodeOutputMap[node.id] = {
            success: true,
            result: await node.resolver({
              ctx: node.getContext(),
              deps: depInputs,
              input,
            }),
          };
        } catch (e: any) {
          nodeOutputMap[node.id] = {
            success: false,
            error: e.message ?? "Unknown error",
          };
        }
      });
    }

    await nodePromiseMap[finalNodeId];

    let resultTree: ResultsTree<TDeps> = {} as any;

    const iterate = (keys: string[], obj: NodeDepsTree) => {
      Object.entries(obj).forEach(([key, value]) => {
        const newKeys = [...keys, key];
        if (value._node) {
          const t = value as Node<any, any, any, any>;
          resultTree = deepset(
            resultTree,
            newKeys,
            nodeOutputMap[t._def.id] ?? null
          ) as ResultsTree<TDeps>;
        } else {
          const map = value as NodeDepsTree;
          iterate(newKeys, map);
        }
      });
    };
    iterate([], nodeDef.deps);

    nodeDef.artifacts = {
      lastRun: new Date(),
      results: resultTree,
    };

    const res = nodeOutputMap[finalNodeId];
    if (res.success) {
      return res.result;
    } else {
      throw new Error(res.error);
    }
  };
}

function createThenNodeCreator<
  TNewOutput,
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
>(
  nodeDef: NodeDef<TDeps, TOutput, TContext, TInput>
): (
  thenResolver: (opts: TOutput) => MaybePromise<TNewOutput>
) => Node<TDeps, TNewOutput, TContext, TInput> {
  return (thenResolver): Node<TDeps, TNewOutput, TContext, TInput> => {
    const newResolver = async (
      opts: ResolverOptions<TDeps, TContext, TInput>
    ) => {
      const output = await nodeDef.resolver(opts);
      return await thenResolver(output);
    };

    const finalBuilder = createNewNodeBuilder<
      TDeps,
      TNewOutput,
      TContext,
      TInput
    >(nodeDef, {
      resolver: newResolver,
      id: genId(),
    });

    return createNodeFromDef(finalBuilder._def);
  };
}

function createNodeFromDef<
  TDeps extends NodeDepsTree,
  TOutput,
  TContext,
  TInput = undefined
>(
  nodeDef: NodeDef<TDeps, TOutput, TContext, TInput>
): Node<TDeps, TOutput, TContext, TInput> {
  return {
    _node: true,
    _def: nodeDef,
    run: createNodeRunner(nodeDef),
    getArtifacts: () => nodeDef.artifacts,
    then: createThenNodeCreator(nodeDef),
  };
}
