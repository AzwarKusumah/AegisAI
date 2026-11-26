package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/AzwarKusumah/AegisAI/deployments/setup/internal/setup"
)

var version = "dev"

func main() {
	rootFlag := flag.String("root", ".", "AegisAI repository root (defaults to the current directory or a parent)")
	noDeploy := flag.Bool("no-deploy", false, "write configuration but do not start the deployment")
	showVersion := flag.Bool("version", false, "print setup utility version")
	flag.Parse()

	if *showVersion {
		fmt.Printf("AegisAI Setup %s\n", version)
		return
	}

	root, err := setup.FindRepositoryRoot(*rootFlag)
	if err != nil {
		fatal(err)
	}
	if err := setup.Run(root, *noDeploy, os.Getenv("ACCESSIBLE") != ""); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "\nAegisAI setup failed: %v\n", err)
	os.Exit(1)
}
