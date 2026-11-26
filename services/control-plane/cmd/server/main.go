package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/httpapi"
	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/store"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" { log.Fatal("DATABASE_URL is required") }
	agentToken, adminToken := os.Getenv("AEGIS_AGENT_TOKEN"), os.Getenv("AEGIS_ADMIN_TOKEN")
	if agentToken == "" || adminToken == "" { log.Fatal("AEGIS_AGENT_TOKEN and AEGIS_ADMIN_TOKEN are required") }

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := store.Open(ctx, dsn)
	if err != nil { log.Fatalf("database initialization failed: %v", err) }
	defer db.Close()

	address := os.Getenv("AEGIS_LISTEN_ADDR")
	if address == "" { address = "127.0.0.1:8787" }
	server := &http.Server{
		Addr: address, Handler: httpapi.New(db, agentToken, adminToken),
		ReadHeaderTimeout: 5*time.Second, ReadTimeout: 10*time.Second,
		WriteTimeout: 10*time.Second, IdleTimeout: 60*time.Second,
	}
	go func() {
		log.Printf("AegisAI control plane listening on %s", address)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed { log.Fatalf("server failed: %v", err) }
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals
	shutdown, stop := context.WithTimeout(context.Background(), 10*time.Second)
	defer stop()
	if err := server.Shutdown(shutdown); err != nil { log.Printf("shutdown error: %v", err) }
}
