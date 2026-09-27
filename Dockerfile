# Tự host toàn bộ app (API + giao diện) bằng Node — phương án dự phòng cho Supabase + Vercel.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build -w client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/client/dist \
    YT_CACHE_DIR=/app/data/youtubei-cache
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server --include-workspace-root=false && npm cache clean --force
COPY server server
COPY supabase supabase
COPY --from=build /app/client/dist client/dist
VOLUME /app/data
EXPOSE 3001
WORKDIR /app/server
CMD ["node", "--import", "tsx", "node.ts"]
