package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const defaultHealthURL = "https://openwhatsapp-khtx.onrender.com/health"
const defaultInterval = time.Minute
const requestTimeout = 90 * time.Second

func main() {
	healthURL := strings.TrimSpace(os.Getenv("HEALTH_URL"))
	if healthURL == "" {
		healthURL = defaultHealthURL
	}
	parsedURL, err := parseHealthURL(healthURL)
	if err != nil {
		log.Fatal(err)
	}

	interval := defaultInterval
	if configured := strings.TrimSpace(os.Getenv("PING_INTERVAL")); configured != "" {
		parsed, err := time.ParseDuration(configured)
		if err != nil || parsed <= 0 {
			log.Fatalf("PING_INTERVAL must be a positive Go duration (for example 1m): %q", configured)
		}
		interval = parsed
	}

	client := &http.Client{Timeout: requestTimeout}
	log.Printf("health pinger started: target=%s%s interval=%s", parsedURL.Host, parsedURL.EscapedPath(), interval)

	ping(client, parsedURL.String())
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		ping(client, parsedURL.String())
	}
}

func ping(client *http.Client, url string) {
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		log.Printf("health ping failed: could not create request: %v", err)
		return
	}

	started := time.Now()
	response, err := client.Do(request)
	if err != nil {
		log.Printf("health ping failed: %v", err)
		return
	}
	defer response.Body.Close()

	elapsed := time.Since(started).Round(time.Millisecond)
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		log.Printf("health ping unhealthy: status=%d duration=%s", response.StatusCode, elapsed)
		return
	}
	log.Printf("health ping ok: status=%d duration=%s", response.StatusCode, elapsed)
}

func parseHealthURL(raw string) (*url.URL, error) {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, errors.New("HEALTH_URL must be an absolute HTTP(S) URL")
	}
	return parsed, nil
}
