package kratos

import (
	"context"
	"net/http"

	ory "github.com/ory/kratos-client-go"

	"github.com/user/auth-service/internal/config"
	"github.com/user/auth-service/internal/domain"
)

// Client wraps the Ory Kratos API client.
type Client struct {
	api        *ory.APIClient
	cookieName string
}

// NewClient creates a new Kratos client.
func NewClient(cfg *config.Config) *Client {
	configuration := ory.NewConfiguration()
	configuration.Servers = []ory.ServerConfiguration{
		{URL: cfg.KratosPublicURL},
	}

	return &Client{
		api:        ory.NewAPIClient(configuration),
		cookieName: cfg.SessionCookieName,
	}
}

// ValidateSession validates a session from cookies and returns the session info.
func (c *Client) ValidateSession(ctx context.Context, cookies string) (*domain.Session, *domain.User, error) {
	resp, httpResp, err := c.api.FrontendAPI.ToSession(ctx).Cookie(cookies).Execute()
	if err != nil {
		if httpResp != nil && httpResp.StatusCode == http.StatusUnauthorized {
			return nil, nil, domain.ErrUnauthenticated
		}
		return nil, nil, err
	}

	if resp == nil || !resp.GetActive() {
		return nil, nil, domain.ErrSessionInactive
	}

	identity := resp.GetIdentity()

	// Extract traits as map[string]interface{}
	traits := make(map[string]interface{})
	if t := identity.GetTraits(); t != nil {
		if m, ok := t.(map[string]interface{}); ok {
			traits = m
		}
	}

	session := &domain.Session{
		ID:        resp.GetId(),
		UserID:    identity.GetId(),
		Active:    resp.GetActive(),
		ExpiresAt: resp.GetExpiresAt(),
	}

	user := &domain.User{
		ID:        identity.GetId(),
		Email:     extractEmail(traits),
		Traits:    traits,
		CreatedAt: identity.GetCreatedAt(),
	}

	return session, user, nil
}

// Login initiates a login flow with Kratos.
func (c *Client) Login(ctx context.Context, identifier, password string) (string, *domain.User, error) {
	// Create a login flow
	flow, _, err := c.api.FrontendAPI.CreateNativeLoginFlow(ctx).Execute()
	if err != nil {
		return "", nil, err
	}

	// Submit credentials
	body := ory.UpdateLoginFlowBody{
		UpdateLoginFlowWithPasswordMethod: &ory.UpdateLoginFlowWithPasswordMethod{
			Identifier: identifier,
			Password:   password,
			Method:     "password",
		},
	}

	resp, _, err := c.api.FrontendAPI.UpdateLoginFlow(ctx).
		Flow(flow.GetId()).
		UpdateLoginFlowBody(body).
		Execute()
	if err != nil {
		return "", nil, err
	}

	identity := resp.Session.GetIdentity()
	traits := make(map[string]interface{})
	if t := identity.GetTraits(); t != nil {
		if m, ok := t.(map[string]interface{}); ok {
			traits = m
		}
	}

	user := &domain.User{
		ID:        identity.GetId(),
		Email:     extractEmail(traits),
		Traits:    traits,
		CreatedAt: identity.GetCreatedAt(),
	}

	return resp.GetSessionToken(), user, nil
}

func extractEmail(traits map[string]interface{}) string {
	if email, ok := traits["email"].(string); ok {
		return email
	}
	return ""
}
