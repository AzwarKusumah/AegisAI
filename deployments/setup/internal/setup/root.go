package setup

import (
	"fmt"
	"os"
	"path/filepath"
)

func FindRepositoryRoot(start string) (string, error) {
	absolute, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(absolute)
	if err == nil && !info.IsDir() {
		absolute = filepath.Dir(absolute)
	}
	for current := absolute; ; current = filepath.Dir(current) {
		required := []string{
			filepath.Join(current, "deployments", "compose", "docker-compose.yml"),
			filepath.Join(current, "apps", "dashboard", "Dockerfile"),
			filepath.Join(current, "services", "control-plane", "cmd", "server", "main.go"),
		}
		valid := true
		for _, path := range required {
			if _, err := os.Stat(path); err != nil {
				valid = false
				break
			}
		}
		if valid {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return "", fmt.Errorf("AegisAI repository not found from %s; run this utility from the repository root or pass --root", absolute)
}
