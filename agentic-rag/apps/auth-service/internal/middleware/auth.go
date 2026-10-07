package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"errors"

	"github.com/user/auth-service/internal/domain"
	"github.com/user/auth-service/internal/infrastructure/kratos"
)

// ContextKey is a type for context keys.
type ContextKey string

const (
	// UserIDKey is the context key for the authenticated user ID.
	UserIDKey ContextKey = "user_id"
	// UserEmailKey is the context key for the authenticated user email.
	UserEmailKey ContextKey = "user_email"
	// SessionIDKey is the context key for the session ID.
	SessionIDKey ContextKey = "session_id"
)

// AuthMiddleware creates a standard net/http middleware for authentication.
func AuthMiddleware(kratosClient *kratos.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for public endpoints
			if isPublicEndpoint(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			ctx := r.Context()

			// Extract session cookie from headers
			cookies := r.Header.Get("Cookie")
			if cookies == "" {
				// Also check Authorization header for API tokens
				auth := r.Header.Get("Authorization")
				if auth != "" {
					cookies = auth
				}
			}

			if cookies == "" {
				http.Error(w, "no authentication provided", http.StatusUnauthorized)
				return
			}

			// Validate session with Kratos
			session, user, err := kratosClient.ValidateSession(ctx, cookies)
			if err != nil {
				if errors.Is(err, domain.ErrUnauthenticated) {
					http.Error(w, "unauthenticated", http.StatusUnauthorized)
					return
				}
				if errors.Is(err, domain.ErrSessionInactive) {
					http.Error(w, "session inactive", http.StatusUnauthorized)
					return
				}
				// Log internal error but don't leak details to client
				slog.Error("internal auth error", "error", err)
				http.Error(w, "authentication failed", http.StatusInternalServerError)
				return
			}

			// Attach user info to context
			ctx = context.WithValue(ctx, UserIDKey, user.ID)
			ctx = context.WithValue(ctx, UserEmailKey, user.Email)
			ctx = context.WithValue(ctx, SessionIDKey, session.ID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// isPublicEndpoint checks if a procedure is public (doesn't require auth).
func isPublicEndpoint(procedure string) bool {
	publicProcedures := []string{
		"/auth.v1.IdentityService/Login",
		"/health",
		"/health/live",
		"/health/ready",
	}

	for _, p := range publicProcedures {
		if strings.HasSuffix(procedure, p) || procedure == p {
			return true
		}
	}
	return false
}

// GetUserID extracts the user ID from context.
func GetUserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UserIDKey).(string)
	return id, ok
}

// GetUserEmail extracts the user email from context.
func GetUserEmail(ctx context.Context) (string, bool) {
	email, ok := ctx.Value(UserEmailKey).(string)
	return email, ok
}
