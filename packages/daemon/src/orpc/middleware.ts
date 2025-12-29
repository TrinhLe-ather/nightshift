type WriteOnly<T> = {
  -readonly [K in keyof T]: T[K];
};

type RouteHandler<T extends string = any, S = any> = (
  req: Bun.BunRequest<T>,
  server: Bun.Server<S>,
) => Response | Promise<Response>;

// Helper to convert union to intersection
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

// Helper to extract output type from middleware
type ExtractOutput<M> = M extends Middleware<any, infer Output, any> ? Output : never;

// Helper to convert array of middleware types to intersection of their outputs
type ExtractDepsContext<T extends readonly any[]> = UnionToIntersection<ExtractOutput<T[number]>>;

// Simplified Middleware type that takes dependencies and output
// TDeps can be either:
//   - An array of output types: [{ ip: string }, { startTime: number }]
//   - An array of middleware types: [typeof withIP, typeof withDuration]
type Middleware<
  TDeps extends readonly any[] = [],
  TOutput extends Record<string, any> = {},
  Route extends string = any,
  WebSocket = any,
> = (
  req: Bun.BunRequest<Route>,
  srv: Bun.Server<WebSocket>,
  ctx: WriteOnly<
    (TDeps[number] extends Middleware<any, any, any>
      ? ExtractDepsContext<TDeps> // Dependencies are middleware types
      : UnionToIntersection<TDeps[number]>) & // Dependencies are output types
      TOutput
  >,
) => Response | Promise<Response> | void | Promise<void>;

// Overloaded withMiddleware signatures for compile-time ordering enforcement
function withMiddleware<Route extends string, C1 extends Record<string, any>>(
  m1: Middleware<[], C1, Route>,
): <R extends Route = Route>(handler: (ctx: C1) => RouteHandler<R>) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
): <R extends Route = Route>(handler: (ctx: C1 & C2) => RouteHandler<R>) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
): <R extends Route = Route>(handler: (ctx: C1 & C2 & C3) => RouteHandler<R>) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
  C6 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
  m6: Middleware<
    [C1, C2, C3, C4, C5] | [C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [],
    C6,
    Route
  >,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5 & C6) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
  C6 extends Record<string, any>,
  C7 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
  m6: Middleware<
    [C1, C2, C3, C4, C5] | [C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [],
    C6,
    Route
  >,
  m7: Middleware<
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C7,
    Route
  >,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5 & C6 & C7) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
  C6 extends Record<string, any>,
  C7 extends Record<string, any>,
  C8 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
  m6: Middleware<
    [C1, C2, C3, C4, C5] | [C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [],
    C6,
    Route
  >,
  m7: Middleware<
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C7,
    Route
  >,
  m8: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C8,
    Route
  >,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
  C6 extends Record<string, any>,
  C7 extends Record<string, any>,
  C8 extends Record<string, any>,
  C9 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
  m6: Middleware<
    [C1, C2, C3, C4, C5] | [C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [],
    C6,
    Route
  >,
  m7: Middleware<
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C7,
    Route
  >,
  m8: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C8,
    Route
  >,
  m9: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7, C8]
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C9,
    Route
  >,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 & C9) => RouteHandler<R>,
) => RouteHandler<R>;

function withMiddleware<
  Route extends string,
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  C3 extends Record<string, any>,
  C4 extends Record<string, any>,
  C5 extends Record<string, any>,
  C6 extends Record<string, any>,
  C7 extends Record<string, any>,
  C8 extends Record<string, any>,
  C9 extends Record<string, any>,
  C10 extends Record<string, any>,
>(
  m1: Middleware<[], C1, Route>,
  m2: Middleware<[C1], C2, Route>,
  m3: Middleware<[C1, C2] | [C1] | [], C3, Route>,
  m4: Middleware<[C1, C2, C3] | [C1, C2] | [C1] | [], C4, Route>,
  m5: Middleware<[C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [], C5, Route>,
  m6: Middleware<
    [C1, C2, C3, C4, C5] | [C1, C2, C3, C4] | [C1, C2, C3] | [C1, C2] | [C1] | [],
    C6,
    Route
  >,
  m7: Middleware<
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C7,
    Route
  >,
  m8: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C8,
    Route
  >,
  m9: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7, C8]
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C9,
    Route
  >,
  m10: Middleware<
    | [C1, C2, C3, C4, C5, C6, C7, C8, C9]
    | [C1, C2, C3, C4, C5, C6, C7, C8]
    | [C1, C2, C3, C4, C5, C6, C7]
    | [C1, C2, C3, C4, C5, C6]
    | [C1, C2, C3, C4, C5]
    | [C1, C2, C3, C4]
    | [C1, C2, C3]
    | [C1, C2]
    | [C1]
    | [],
    C10,
    Route
  >,
): <R extends Route = Route>(
  handler: (ctx: C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 & C9 & C10) => RouteHandler<R>,
) => RouteHandler<R>;

// Implementation
function withMiddleware(...middlewares: Middleware<any, any, any>[]) {
  return (handler: (ctx: any) => RouteHandler<any>): RouteHandler<any> => {
    return async (req, srv) => {
      const ctx: Record<string, any> = {};

      // Run middleware in order, short-circuit if any returns a Response
      for (const middleware of middlewares) {
        const result = await middleware(req, srv, ctx);
        if (result instanceof Response) {
          return result;
        }
      }

      return handler(ctx)(req, srv);
    };
  };
}

export type { Middleware, RouteHandler, WriteOnly };
export { withMiddleware };
