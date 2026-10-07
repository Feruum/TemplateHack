                          package config

import (
	"os"
	"time"
)

// Config holds all configuration for the auth service.
type Config struct {
	// Server settings
	ServerAddr string
	
	// Kratos settings
	KratosPublicURL string
	KratosAdminURL  string
	
	// SpiceDB settings
	SpiceDBAddr       string
	SpiceDBToken      string
	SpiceDBInsecure   bool
	
	// Session settings
	SessionCookieName   string
	SessionMaxAge       time.Duration
	
	// Security
	TLSEnabled bool
	TLSCert    string
	TLSKey     string
}

// Load loads configuration from environment variables.
func Load() *Config {
	return &Config{
		ServerAddr:        getEnv("AUTH_SERVER_ADDR", ":8080"),
		KratosPublicURL:   getEnv("KRATOS_PUBLIC_URL", "http://localhost:4433"),
		KratosAdminURL:    getEnv("KRATOS_ADMIN_URL", "http://localhost:4434"),
		SpiceDBAddr:       getEnv("SPICEDB_ADDR", "localhost:50051"),
		SpiceDBToken:      getEnv("SPICEDB_TOKEN", "secret"),
		SpiceDBInsecure:   getEnv("SPICEDB_INSECURE", "true") == "true",
		SessionCookieName: getEnv("SESSION_COOKIE_NAME", "ory_kratos_session"),
		SessionMaxAge:     parseDuration(getEnv("SESSION_MAX_AGE", "24h")),
		TLSEnabled:        getEnv("TLS_ENABLED", "false") == "true",
		TLSCert:           getEnv("TLS_CERT", ""),
		TLSKey:            getEnv("TLS_KEY", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 24 * time.Hour
	}
	return d
}
