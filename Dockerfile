# Hono API + ビルド済みSPA(web/dist)を1コンテナで配信する。
# 実行時のcwdは /app/server (server/src/index.ts が ../web/dist を相対参照するため)。
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY server server
COPY web web
RUN pnpm build
# ビルド後に開発依存を落とす
RUN CI=true pnpm install --frozen-lockfile --prod

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
USER node
WORKDIR /app/server
EXPOSE 3001
CMD ["node", "dist/index.js"]
