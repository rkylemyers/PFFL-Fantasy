package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	LeagueID = "44108"
	Year     = "2026"
	BaseURL  = "https://www44.myfantasyleague.com/2026/export"
	DocsData = "docs/data"
)

type SyncResult struct {
	Endpoint string    `json:"endpoint"`
	Status   string    `json:"status"`
	Updated  time.Time `json:"updated"`
}

func main() {
	if err := os.MkdirAll(DocsData, 0755); err != nil {
		log.Fatalf("Failed to create data dir: %v", err)
	}

	fmt.Println("⚡ PFFL Fantasy Data Synchronizer Initializing...")

	endpoints := map[string]string{
		"league.json":       fmt.Sprintf("%s?TYPE=league&L=%s&JSON=1", BaseURL, LeagueID),
		"rosters.json":      fmt.Sprintf("%s?TYPE=rosters&L=%s&JSON=1", BaseURL, LeagueID),
		"transactions.json": fmt.Sprintf("%s?TYPE=transactions&L=%s&JSON=1", BaseURL, LeagueID),
		"players.json":      fmt.Sprintf("%s?TYPE=players&JSON=1", BaseURL),
		"liveScoring.json":  fmt.Sprintf("%s?TYPE=liveScoring&L=%s&JSON=1", BaseURL, LeagueID),
		"projectedScores.json": fmt.Sprintf("%s?TYPE=projectedScores&L=%s&JSON=1", BaseURL, LeagueID),
	}

	var wg sync.WaitGroup
	results := make(chan SyncResult, len(endpoints))

	for filename, url := range endpoints {
		wg.Add(1)
		go func(fname, u string) {
			defer wg.Done()
			err := fetchAndSave(u, filepath.Join(DocsData, fname))
			if err != nil {
				log.Printf("❌ Error fetching %s: %v", fname, err)
				results <- SyncResult{Endpoint: fname, Status: "error", Updated: time.Now()}
			} else {
				log.Printf("✅ Synced %s successfully", fname)
				results <- SyncResult{Endpoint: fname, Status: "success", Updated: time.Now()}
			}
		}(filename, url)
	}

	wg.Wait()
	close(results)

	// Save sync meta
	metaPath := filepath.Join(DocsData, "sync_status.json")
	metaData, _ := json.MarshalIndent(map[string]interface{}{
		"last_sync": time.Now().Format(time.RFC3339),
		"league_id": LeagueID,
		"year":      Year,
	}, "", "  ")
	os.WriteFile(metaPath, metaData, 0644)

	fmt.Println("🚀 Sync complete! Files written to docs/data/")

	// If argument includes --server, start HTTP server for local testing
	for _, arg := range os.Args[1:] {
		if arg == "--server" || arg == "-s" {
			startServer()
			break
		}
	}
}

func fetchAndSave(url, targetPath string) error {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "PFFL-Manager/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	return os.WriteFile(targetPath, body, 0644)
}

func startServer() {
	port := "8080"
	fs := http.FileServer(http.Dir("docs"))
	http.Handle("/", fs)

	log.Printf("🌐 Local PFFL Development Server running at http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
