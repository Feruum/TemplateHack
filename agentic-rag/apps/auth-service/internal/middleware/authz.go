package middleware

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"

	"github.com/user/auth-service/internal/infrastructure/spicedb"
)

// AuthzInterceptor creates a ConnectRPC unary interceptor for authorization.
// This is a generic interceptor that can be used for resource-based access control.
// For more specific checks, use the SpiceDB client directly in handlers.
func AuthzInterceptor(spiceClient *spicedb.Client) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Get user ID from context (set by auth interceptor)
			userID, ok := GetUserID(ctx)
			if !ok {
				// No user ID means auth interceptor allowed this (public endpoint)
				return next(ctx, req)
			}

			// Log the authorization check for observability
			slog.Info("authz_check",
				"user_id", userID,
				"procedure", req.Spec().Procedure,
			)

			// For now, proceed with the request
			// Specific permission checks should be done in handlers
			// This interceptor can be extended to extract resource info from request metadata
			return next(ctx, req)
		}
	}
}

// CheckPermission is a helper function to check permissions in handlers.
func CheckPermission(
	ctx context.Context,
	client *spicedb.Client,
	resourceType, resourceID, permission string,
) error {
	userID, ok := GetUserID(ctx)
	if !ok {
		return connect.NewError(connect.CodeUnauthenticated, nil)
	}

	allowed, err := client.CheckPermission(ctx, resourceType, resourceID, permission, "user", userID)
	if err != nil {
		slog.Error("permission_check_failed",
			"error", err,
			"user_id", userID,
			"resource", resourceType+":"+resourceID,
			"permission", permission,
		)
		return connect.NewError(connect.CodeInternal, err)
	}

	if !allowed {
		slog.Warn("permission_denied",
			"user_id", userID,
			"resource", resourceType+":"+resourceID,
			"permission", permission,
		)
		return connect.NewError(connect.CodePermissionDenied, nil)
	}

	return nil
}
