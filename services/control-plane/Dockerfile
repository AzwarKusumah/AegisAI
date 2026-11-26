FROM golang:1.23-alpine AS build
WORKDIR /src/services/control-plane
COPY services/control-plane/ ./
RUN go mod tidy
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/aegisai-control-plane ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build --chown=nonroot:nonroot /out/aegisai-control-plane /aegisai-control-plane
USER nonroot:nonroot
EXPOSE 8787
ENTRYPOINT ["/aegisai-control-plane"]
