/**
 * Normalizes route paths so `/users/:id` and `/users/{id}` compare identically.
 *
 * @param {string} routePath
 * @returns {string}
 */
function normalizeRoutePath(routePath) {
  return (
    String(routePath || '')
      .trim()
      .replace(/\{([^}]+)\}/g, ':$1')
      .replace(/\/+$/, '') || '/'
  );
}

/**
 * Extracts OpenAPI operations (`METHOD /path`) from an OpenAPI v3 / Swagger v2 object or JSON string.
 *
 * @param {object|string} openapiSpec
 * @returns {Array<{key: string, method: string, path: string}>}
 */
function extractOpenApiEndpoints(openapiSpec) {
  if (!openapiSpec) return [];
  const spec = typeof openapiSpec === 'string' ? JSON.parse(openapiSpec) : openapiSpec;
  const paths = spec?.paths || {};
  const endpoints = [];
  const validMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

  for (const [rawPath, methodsObj] of Object.entries(paths)) {
    if (!methodsObj || typeof methodsObj !== 'object') continue;
    const normPath = normalizeRoutePath(rawPath);
    for (const methodKey of Object.keys(methodsObj)) {
      const m = methodKey.toLowerCase();
      if (!validMethods.has(m)) continue;
      const upper = m.toUpperCase();
      endpoints.push({
        key: `${upper} ${normPath}`,
        method: upper,
        path: normPath,
      });
    }
  }
  return endpoints;
}

/**
 * Extracts GraphQL Query and Mutation field names from GraphQL SDL text.
 *
 * @param {string} graphqlSdl
 * @returns {Array<{key: string, type: 'Query'|'Mutation', field: string}>}
 */
function extractGraphqlFields(graphqlSdl) {
  const sdl = String(graphqlSdl || '');
  if (!sdl.trim()) return [];
  const results = [];
  const blockRegex = /type\s+(Query|Mutation)\s*\{([^}]*)\}/g;
  let match;
  while ((match = blockRegex.exec(sdl)) !== null) {
    const typeName = /** @type {'Query'|'Mutation'} */ (match[1]);
    const body = match[2];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const fieldMatch = line.match(/^([a-zA-Z_]\w*)\s*(?:\([^)]*\))?\s*:/);
      if (fieldMatch) {
        results.push({
          key: `${typeName}.${fieldMatch[1]}`,
          type: typeName,
          field: fieldMatch[1],
        });
      }
    }
  }
  return results;
}

/**
 * Extracts implemented HTTP routes and GraphQL resolvers from source files.
 *
 * @param {Array<{path: string, content: string}>} files
 * @returns {{routes: Map<string, string>, resolvers: Map<string, string>}}
 */
function extractCodeHandlers(files) {
  const routes = new Map();
  const resolvers = new Map();

  // Matches app.get('/api/...', ...) or router.post('/api/...', ...)
  const expressRegex =
    /\b(?:app|router|server)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  // Matches req.method === 'POST' && url.pathname === '/api/v1/...'
  const nativeRouteRegex =
    /method\s*===\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`][\s\S]{0,120}?pathname\s*===\s*['"`]([^'"`]+)['"`]/gi;

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!content) continue;

    let m;
    expressRegex.lastIndex = 0;
    while ((m = expressRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const normPath = normalizeRoutePath(m[2]);
      routes.set(`${method} ${normPath}`, file);
    }

    nativeRouteRegex.lastIndex = 0;
    while ((m = nativeRouteRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const normPath = normalizeRoutePath(m[2]);
      routes.set(`${method} ${normPath}`, file);
    }

    // GraphQL resolvers: Query: { fieldName(...) {} } or Mutation: { fieldName: ... }
    const resolverBlockRegex = /\b(Query|Mutation)\s*:\s*\{([^}]*)\}/g;
    while ((m = resolverBlockRegex.exec(content)) !== null) {
      const typeName = m[1];
      const block = m[2];
      const fieldRegex = /\b([a-zA-Z_]\w*)\s*(?::|\()/g;
      let fm;
      while ((fm = fieldRegex.exec(block)) !== null) {
        const fieldName = fm[1];
        if (fieldName === 'async' || fieldName === 'function') continue;
        resolvers.set(`${typeName}.${fieldName}`, file);
      }
    }
  }

  return { routes, resolvers };
}

/**
 * Checks parity between OpenAPI / GraphQL schemas and code handlers/resolvers (F8-4).
 *
 * @param {object} options
 * @param {object|string} [options.openapiSpec]
 * @param {string} [options.graphqlSdl]
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @returns {{
 *   inSync: boolean,
 *   parityScore: number,
 *   unimplementedInCode: Array<{key: string, kind: 'rest' | 'graphql'}>,
 *   undocumentedInSchema: Array<{key: string, kind: 'rest' | 'graphql', file: string}>,
 *   matchedCount: number
 * }}
 */
export function checkSchemaCodeParity(options = {}) {
  const { openapiSpec, graphqlSdl, files = [] } = options;
  const openApiEndpoints = extractOpenApiEndpoints(openapiSpec);
  const graphqlFields = extractGraphqlFields(graphqlSdl);
  const { routes, resolvers } = extractCodeHandlers(files);

  const unimplementedInCode = [];
  const undocumentedInSchema = [];
  let matchedCount = 0;

  const schemaRouteKeys = new Set();
  for (const ep of openApiEndpoints) {
    schemaRouteKeys.add(ep.key);
    if (routes.has(ep.key)) {
      matchedCount++;
    } else {
      unimplementedInCode.push({ key: ep.key, kind: 'rest' });
    }
  }

  if (openapiSpec) {
    for (const [routeKey, file] of routes.entries()) {
      if (!schemaRouteKeys.has(routeKey)) {
        undocumentedInSchema.push({ key: routeKey, kind: 'rest', file });
      }
    }
  }

  const schemaGqlKeys = new Set();
  for (const gql of graphqlFields) {
    schemaGqlKeys.add(gql.key);
    if (resolvers.has(gql.key)) {
      matchedCount++;
    } else {
      unimplementedInCode.push({ key: gql.key, kind: 'graphql' });
    }
  }

  if (graphqlSdl) {
    for (const [gqlKey, file] of resolvers.entries()) {
      if (!schemaGqlKeys.has(gqlKey)) {
        undocumentedInSchema.push({ key: gqlKey, kind: 'graphql', file });
      }
    }
  }

  const totalItems = matchedCount + unimplementedInCode.length + undocumentedInSchema.length;
  const parityScore = totalItems > 0 ? Math.round((matchedCount / totalItems) * 100) : 100;

  return {
    inSync: unimplementedInCode.length === 0 && undocumentedInSchema.length === 0,
    parityScore,
    unimplementedInCode,
    undocumentedInSchema,
    matchedCount,
  };
}
