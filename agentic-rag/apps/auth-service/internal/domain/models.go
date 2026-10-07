package domain

import "time"

type User struct {
	ID        string
	Email     string
	Traits    map[string]interface{}
	CreatedAt time.Time
}

type Session struct {
	ID        string
	UserID    string
	Active    bool
	ExpiresAt time.Time
}

type IdentityRepository interface {
	GetUser(id string) (*User, error)
	ValidateSession(token string) (*Session, error)
}

type PermissionRepository interface {
	Check(resource, action, subject string) (bool, error)
}
