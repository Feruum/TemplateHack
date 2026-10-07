package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	authv1 "github.com/user/auth-service/gen/auth/v1"
	"github.com/user/auth-service/gen/auth/v1/authv1connect"
	"github.com/user/auth-service/internal/infrastructure/kratos"
	"github.com/user/auth-service/internal/middleware"
)

// IdentityHandler implements the IdentityService.
type IdentityHandler struct {
	kratosClient *kratos.Client
}

// NewIdentityHandler creates a new identity service handler.
func NewIdentityHandler(kratosClient *kratos.Client) *IdentityHandler {
	return &IdentityHandler{
		kratosClient: kratosClient,
	}
}

// Ensure we implement the interface.
var _ authv1connect.IdentityServiceHandler = (*IdentityHandler)(nil)

// Login handles user login via Kratos.
func (h *IdentityHandler) Login(
	ctx context.Context,
	req *connect.Request[authv1.LoginRequest],
) (*connect.Response[authv1.LoginResponse], error) {
	token, user, err := h.kratosClient.Login(ctx, req.Msg.Identifier, req.Msg.Password)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}

	resp := &authv1.LoginResponse{
		SessionToken: token,
		User: &authv1.User{
			Id:     user.ID,
			Email:  user.Email,
			Traits: convertTraits(user.Traits),
		},
	}

	return connect.NewResponse(resp), nil
}

// WhoAmI returns the current authenticated user's information.
func (h *IdentityHandler) WhoAmI(
	ctx context.Context,
	req *connect.Request[authv1.WhoAmIRequest],
) (*connect.Response[authv1.WhoAmIResponse], error) {
	// Get user info from context (set by auth interceptor)
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated,
			errors.New("user not authenticated"))
	}

	userEmail, _ := middleware.GetUserEmail(ctx)

	resp := &authv1.WhoAmIResponse{
		User: &authv1.User{
			Id:    userID,
			Email: userEmail,
		},
	}

	return connect.NewResponse(resp), nil
}

func convertTraits(traits map[string]interface{}) map[string]string {
	result := make(map[string]string)
	for k, v := range traits {
		if s, ok := v.(string); ok {
			result[k] = s
		}
	}
	return result
}
