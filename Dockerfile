# syntax=docker/dockerfile:1.21

FROM oven/bun:1.3.8-debian AS builder
WORKDIR /app

COPY bun.lock package.json tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src

RUN mkdir -p dist
RUN bun build ./src/index.ts --compile --bytecode --minify --sourcemap --outfile dist/network-bootstrapper

FROM gcr.io/distroless/base-debian12:nonroot
LABEL org.opencontainers.image.source="https://github.com/settlemint/network-bootstrapper"
WORKDIR /app

COPY --from=builder /app/dist/network-bootstrapper /usr/local/bin/network-bootstrapper

USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/network-bootstrapper"]
