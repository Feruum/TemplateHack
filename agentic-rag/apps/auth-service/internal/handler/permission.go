package handler

import (
	"context"

	"connectrpc.com/connect"

	authv1 "github.com/user/auth-service/gen/auth/v1"
	"github.com/user/auth-service/gen/auth/v1/authv1connect"
	"github.com/user/auth-service/internal/infrastructure/spicedb"
)

// PermissionHandler implements the PermissionService.
type PermissionHandler struct {
	spiceClient *spicedb.Client
}

// NewPermissionHandler creates a new permission service handler.
func NewPermissionHandler(spiceClient *spicedb.Client) *PermissionHandler {
	return &PermissionHandler{
		spiceClient: spiceClient,
	}
}

// Ensure we implement the interface.
var _ authv1connect.PermissionServiceHandler = (*PermissionHandler)(nil)

// CheckPermission checks if a subject has permission on a resource.
func (h *PermissionHandler) CheckPermission(
	ctx context.Context,
	req *connect.Request[authv1.CheckPermissionRequest],
) (*connect.Response[authv1.CheckPermissionResponse], error) {
	allowed, err := h.spiceClient.CheckPermission(
		ctx,
		req.Msg.ResourceType,
		req.Msg.ResourceId,
		req.Msg.Permission,
		req.Msg.SubjectType,
		req.Msg.SubjectId,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	resp := &authv1.CheckPermissionResponse{
		Allowed: allowed,
	}

	return connect.NewResponse(resp), nil
}
