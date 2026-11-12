// Package cmd defines the tend command tree. Subcommands (login, add, ls, ...)
// attach to the root returned by NewRoot and read settings from App.
package cmd

import (
	"github.com/meninoebom/tend/cli/internal/config"
	"github.com/spf13/cobra"
)

// App carries state shared by every subcommand. Config is populated before
// any subcommand's Run executes.
type App struct {
	ConfigPath string
	Config     config.Config
}

// NewRoot builds the root `tend` command. version is injected at build time
// via -ldflags "-X main.version=...".
func NewRoot(version string) (*cobra.Command, *App) {
	app := &App{Config: config.Default()}

	root := &cobra.Command{
		Use:           "tend",
		Short:         "Tend from the terminal",
		Long:          "tend is the command-line client for Tend, the conscious todo app.",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			path := app.ConfigPath
			if path == "" {
				p, err := config.DefaultPath()
				if err != nil {
					return err
				}
				path = p
			}
			cfg, err := config.Load(path)
			if err != nil {
				return err
			}
			app.Config = cfg
			return nil
		},
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
	}
	root.SetVersionTemplate("tend {{.Version}}\n")
	root.PersistentFlags().StringVar(&app.ConfigPath, "config", "",
		"path to config file (default ~/.config/tend/config.toml)")

	return root, app
}
