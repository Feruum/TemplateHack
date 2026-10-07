package spicedb

import (
	"context"

	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/authzed-go/v1"
	"github.com/authzed/grpcutil"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/user/auth-service/internal/config"
)

// Client wraps the SpiceDB permissions client.
type Client struct {
	client *authzed.Client
}

// NewClient creates a new SpiceDB client.
func NewClient(cfg *config.Config) (*Client, error) {
	var opts []grpc.DialOption

	if cfg.SpiceDBInsecure {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
		opts = append(opts, grpcutil.WithInsecureBearerToken(cfg.SpiceDBToken))
	} else {
		opts = append(opts, grpcutil.WithBearerToken(cfg.SpiceDBToken))
	}

	client, err := authzed.NewClient(cfg.SpiceDBAddr, opts...)
	if err != nil {
		return nil, err
	}

	return &Client{client: client}, nil
}

// CheckPermission checks if a subject has permission on a resource.
func (c *Client) CheckPermission(
	ctx context.Context,
	resourceType, resourceID string,
	permission string,
	subjectType, subjectID string,
) (bool, error) {
	resp, err := c.client.CheckPermission(ctx, &v1.CheckPermissionRequest{
		Consistency: &v1.Consistency{
			Requirement: &v1.Consistency_FullyConsistent{FullyConsistent: true},
		},
		Resource: &v1.ObjectReference{
			ObjectType: resourceType,
			ObjectId:   resourceID,
		},
		Permission: permission,
		Subject: &v1.SubjectReference{
			Object: &v1.ObjectReference{
				ObjectType: subjectType,
				ObjectId:   subjectID,
			},
		},
	})
	if err != nil {
		return false, err
	}

	return resp.Permissionship == v1.CheckPermissionResponse_PERMISSIONSHIP_HAS_PERMISSION, nil
}

// WriteRelationship writes a relationship tuple to SpiceDB.
func (c *Client) WriteRelationship(
	ctx context.Context,
	resourceType, resourceID, relation string,
	subjectType, subjectID string,
) error {
	_, err := c.client.WriteRelationships(ctx, &v1.WriteRelationshipsRequest{
		Updates: []*v1.RelationshipUpdate{
			{
				Operation: v1.RelationshipUpdate_OPERATION_TOUCH,
				Relationship: &v1.Relationship{
					Resource: &v1.ObjectReference{
						ObjectType: resourceType,
						ObjectId:   resourceID,
					},
					Relation: relation,
					Subject: &v1.SubjectReference{
						Object: &v1.ObjectReference{
							ObjectType: subjectType,
							ObjectId:   subjectID,
						},
					},
				},
			},
		},
	})
	return err
}

// DeleteRelationship removes a relationship tuple from SpiceDB.
func (c *Client) DeleteRelationship(
	ctx context.Context,
	resourceType, resourceID, relation string,
	subjectType, subjectID string,
) error {
	_, err := c.client.WriteRelationships(ctx, &v1.WriteRelationshipsRequest{
		Updates: []*v1.RelationshipUpdate{
			{
				Operation: v1.RelationshipUpdate_OPERATION_DELETE,
				Relationship: &v1.Relationship{
					Resource: &v1.ObjectReference{
						ObjectType: resourceType,
						ObjectId:   resourceID,
					},
					Relation: relation,
					Subject: &v1.SubjectReference{
						Object: &v1.ObjectReference{
							ObjectType: subjectType,
							ObjectId:   subjectID,
						},
					},
				},
			},
		},
	})
	return err
}
