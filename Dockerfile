# syntax=docker/dockerfile:1
# Nebula API (Go). Build context: repository root.

ARG GO_VERSION=1.27

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/nebula-api ./cmd/api

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S nebula && adduser -S -G nebula nebula \
    && mkdir -p /data/uploads && chown -R nebula:nebula /data

COPY --from=build /out/nebula-api /usr/local/bin/nebula-api

USER nebula
ENV SERVER_PORT=8080 \
    UPLOAD_DIR=/data/uploads
EXPOSE 8080
VOLUME ["/data/uploads"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
    CMD nc -z 127.0.0.1 8080 || exit 1

ENTRYPOINT ["nebula-api"]
