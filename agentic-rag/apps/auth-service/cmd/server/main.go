// Package main is the entrypoint for the auth-service.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/user/auth-service/gen/auth/v1/authv1connect"
	"github.com/user/auth-service/internal/config"
	"github.com/user/auth-service/internal/handler"
	"github.com/user/auth-service/internal/infrastructure/kratos"
	"github.com/user/auth-service/internal/infrastructure/spicedb"
	"github.com/user/auth-service/internal/middleware"
)

func main() {
	// Setup structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Load configuration
	cfg := config.Load()

	// Initialize infrastructure clients
	kratosClient := kratos.NewClient(cfg)

	spiceClient, err := spicedb.NewClient(cfg)
	if err != nil {
		slog.Error("failed to create SpiceDB client", "error", err)
		os.Exit(1)
	}

	// Create handlers
	identityHandler := handler.NewIdentityHandler(kratosClient)
	permissionHandler := handler.NewPermissionHandler(spiceClient)

	// Setup interceptors (Authz only for now, AuthN is HTTP middleware)
	interceptors := connect.WithInterceptors(
		middleware.AuthzInterceptor(spiceClient),
	)

	// Create HTTP mux
	mux := http.NewServeMux()

	// Register ConnectRPC services
	identityPath, identityHTTP := authv1connect.NewIdentityServiceHandler(
		identityHandler,
		interceptors,
	)
	mux.Handle(identityPath, identityHTTP)

	permissionPath, permissionHTTP := authv1connect.NewPermissionServiceHandler(
		permissionHandler,
		interceptors,
	)
	mux.Handle(permissionPath, permissionHTTP)

	// Health check endpoints
	// Liveness probe - just confirms the service is running
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Readiness probe - could add dependency checks here
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		// TODO: Add Kratos/SpiceDB health checks if needed
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Legacy health endpoint for backwards compatibility
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Chain middleware
	// 1. AuthMiddleware
	// 2. h2c (HTTP/2 Cleartext)
	var rootHandler http.Handler = mux
	rootHandler = middleware.AuthMiddleware(kratosClient)(rootHandler)
	rootHandler = h2c.NewHandler(rootHandler, &http2.Server{})

	// Create server with h2c support (HTTP/2 without TLS)
	server := &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      rootHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		slog.Info("starting auth-service", "addr", cfg.ServerAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}

	slog.Info("server stopped")
}
