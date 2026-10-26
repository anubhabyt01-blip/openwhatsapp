package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultRenderHealthURL = "https://openwhatsapp-khtx.onrender.com/health"
	defaultHealthInterval  = time.Minute
	healthRequestTimeout   = 90 * time.Second
)

func startHealthPinger(ctx context.Context, configuredURL, configuredInterval string) {
	target := strings.TrimSpace(configuredURL)
	if target == "" {
		target = defaultRenderHealthURL
	}

	parsedURL, err := url.ParseRequestURI(target)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "https" && parsedURL.Scheme != "http") {
		log.Printf("health pinger disabled: HEALTH_URL must be an absolute HTTP(S) URL")
		return
	}

	interval := defaultHealthInterval
	if configured := strings.TrimSpace(configuredInterval); configured != "" {
		parsed, err := time.ParseDuration(configured)
		if err != nil || parsed <= 0 {
			log.Printf("invalid HEALTH_PING_INTERVAL %q; using %s", configured, defaultHealthInterval)
		} else {
			interval = parsed
		}
	}

	client := &http.Client{Timeout: healthRequestTimeout}
	log.Printf("health pinger started: target=%s%s interval=%s", parsedURL.Host, parsedURL.EscapedPath(), interval)

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Printf("health pinger stopped")
				return
			case <-ticker.C:
				pingHealthEndpoint(ctx, client, parsedURL.String())
			}
		}
	}()
}

func pingHealthEndpoint(ctx context.Context, client *http.Client, target string) {
	requestCtx, cancel := context.WithTimeout(ctx, healthRequestTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, target, nil)
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
