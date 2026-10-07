package domain

import "errors"

var (
	// ErrUnauthenticated is returned when a user session is invalid or missing.
	ErrUnauthenticated = errors.New("unauthenticated")

	// ErrSessionInactive is returned when a session exists but is marked as inactive.
	ErrSessionInactive = errors.New("session inactive")

	// ErrInternal is returned for unexpected internal errors.
	ErrInternal = errors.New("internal error")
)
