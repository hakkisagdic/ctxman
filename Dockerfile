# syntax=docker/dockerfile:1
#
# ctxman container image
#
#   docker build -t ctxman .
#   docker run --rm -v "$PWD:/work" ctxman --cli
#   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" ctxman --save-report
#   docker run -i --rm -v "$PWD:/work" --entrypoint node ctxman /app/bin/mcp-server.js
#
# The project is mounted at /work, the working directory, and reports and context files are
# written there (hence --user when /work is not writable for uid 1000). The last line runs
# the MCP server over stdio. Usage: docs/commands/ci.md

ARG NODE_VERSION=22

# Production dependencies, from package-lock.json
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Optional dependencies (vector store and embeddings of `ctxman ask`) are left out: they are
# large and need native builds. tiktoken is a devDependency, so `npm ci --omit=dev` skips it;
# it is installed at the locked version on its own (it has no dependencies) for exact counts
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund \
    && TIKTOKEN_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/tiktoken'].version")" \
    && npm install --prefix /tmp/tiktoken --ignore-scripts --no-audit --no-fund "tiktoken@${TIKTOKEN_VERSION}" \
    && cp -R /tmp/tiktoken/node_modules/tiktoken node_modules/tiktoken \
    && rm -rf /tmp/tiktoken

FROM node:${NODE_VERSION}-alpine

LABEL org.opencontainers.image.title="ctxman" \
      org.opencontainers.image.description="Exact token counts and LLM context for codebases" \
      org.opencontainers.image.source="https://github.com/hakkisagdic/ctxman" \
      org.opencontainers.image.licenses="MIT"

# git for --changed-since and the other git features. The mounted project usually belongs
# to another user than the container's, which git refuses unless the path is trusted
# hadolint ignore=DL3018
RUN apk add --no-cache git \
    && git config --system --add safe.directory /work \
    && git config --system --add safe.directory '/work/*'

ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json index.js index.d.ts ctxman.js LICENSE ./
COPY bin ./bin
COPY lib ./lib
COPY .ctxman/llm-profiles.json .ctxman/custom-profiles.example.json ./.ctxman/
COPY .ctxman/profiles ./.ctxman/profiles
COPY .ctxman/templates ./.ctxman/templates
COPY .ctxman/wizard-profiles ./.ctxman/wizard-profiles

# The node user (uid 1000) of the base image; run with --user "$(id -u):$(id -g)" when the
# mounted project belongs to another uid, so ctxman can write its reports there
USER node
WORKDIR /work

ENTRYPOINT ["node", "/app/bin/cli.js"]
CMD ["--help"]
