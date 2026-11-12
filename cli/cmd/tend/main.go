// Command tend is the Tend CLI.
package main

import (
	"fmt"
	"os"

	"github.com/meninoebom/tend/cli/internal/cmd"
)

// version is overridden at build time:
//
//	go build -ldflags "-X main.version=v0.1.0" ./cli/cmd/tend
var version = "dev"

func main() {
	root, _ := cmd.NewRoot(version)
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "tend:", err)
		os.Exit(1)
	}
}
