package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "TERRA",
		Width:  420,
		Height: 280,
		// Splash-sized mins; RevealMainWindow raises these after boot.
		MinWidth:         360,
		MinHeight:        220,
		AlwaysOnTop:      true,
		BackgroundColour: &options.RGBA{R: 8, G: 7, B: 6, A: 1},
		Frameless:        true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnDomReady: app.domReady,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:   mac.TitleBarHiddenInset(),
			Appearance: mac.NSAppearanceNameDarkAqua,
			About: &mac.AboutInfo{
				Title:   "TERRA",
				Message: "Classificacao de cobertura de solo - Sentinel-2 / MapBiomas",
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
