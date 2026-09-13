package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	LeagueID = "44108"
	Year     = "2026"
	BaseURL  = "https://www44.myfantasyleague.com/2026/export"
	APIURL   = "https://api.myfantasyleague.com/2026/export"
	DocsData = "docs/data"
)

func main() {
	if err := os.MkdirAll(DocsData, 0755); err != nil {
		log.Fatalf("Failed to create data dir: %v", err)
	}

	fmt.Println("⚡ PFFL Fantasy Data Synchronizer Initializing...")

	// 1. Sync Core League Data
	fetchAndSave(fmt.Sprintf("%s?TYPE=league&L=%s&JSON=1", BaseURL, LeagueID), filepath.Join(DocsData, "league.json"))
	fetchAndSave(fmt.Sprintf("%s?TYPE=rosters&L=%s&JSON=1", BaseURL, LeagueID), filepath.Join(DocsData, "rosters.json"))
	fetchAndSave(fmt.Sprintf("%s?TYPE=transactions&L=%s&JSON=1", BaseURL, LeagueID), filepath.Join(DocsData, "transactions.json"))
	fetchAndSave(fmt.Sprintf("%s?TYPE=liveScoring&L=%s&JSON=1", BaseURL, LeagueID), filepath.Join(DocsData, "liveScoring.json"))
	fetchAndSave(fmt.Sprintf("%s?TYPE=projectedScores&L=%s&JSON=1", BaseURL, LeagueID), filepath.Join(DocsData, "projectedScores.json"))

	// 2. Collect All Roster & Live Scoring Player IDs
	playerIDs := extractAllPlayerIDs()
	fmt.Printf("🔍 Extracted %d active player IDs from rosters...\n", len(playerIDs))

	// Fetch full player metadata via APIURL
	playersURL := fmt.Sprintf("%s?TYPE=players&PLAYERS=%s&JSON=1", APIURL, strings.Join(playerIDs, ","))
	err := fetchAndSave(playersURL, filepath.Join(DocsData, "players.json"))
	if err != nil {
		log.Printf("⚠️ Warning fetching specific players: %v, trying fallback...", err)
		fetchAndSave(fmt.Sprintf("%s?TYPE=players&JSON=1", APIURL), filepath.Join(DocsData, "players.json"))
	} else {
		log.Printf("✅ Synced exact player dictionary (%d players)", len(playerIDs))
	}

	// Save sync meta
	metaPath := filepath.Join(DocsData, "sync_status.json")
	metaData, _ := json.MarshalIndent(map[string]interface{}{
		"last_sync": time.Now().Format("03:04:05 PM"),
		"league_id": LeagueID,
		"year":      Year,
	}, "", "  ")
	os.WriteFile(metaPath, metaData, 0644)

	fmt.Println("🚀 Sync complete! Files written to docs/data/")

	for _, arg := range os.Args[1:] {
		if arg == "--server" || arg == "-s" {
			startServer()
			break
		}
	}
}

func extractAllPlayerIDs() []string {
	idMap := make(map[string]bool)

	// Read rosters.json
	rostersBytes, err := os.ReadFile(filepath.Join(DocsData, "rosters.json"))
	if err == nil {
		var res map[string]interface{}
		if err := json.Unmarshal(rostersBytes, &res); err == nil {
			if rosters, ok := res["rosters"].(map[string]interface{}); ok {
				if franchiseList, ok := rosters["franchise"].([]interface{}); ok {
					for _, f := range franchiseList {
						if fMap, ok := f.(map[string]interface{}); ok {
							if playerList, ok := fMap["player"].([]interface{}); ok {
								for _, p := range playerList {
									if pMap, ok := p.(map[string]interface{}); ok {
										if id, ok := pMap["id"].(string); ok {
											idMap[id] = true
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Read liveScoring.json
	liveBytes, err := os.ReadFile(filepath.Join(DocsData, "liveScoring.json"))
	if err == nil {
		var res map[string]interface{}
		if err := json.Unmarshal(liveBytes, &res); err == nil {
			if live, ok := res["liveScoring"].(map[string]interface{}); ok {
				if matchups, ok := live["matchup"].([]interface{}); ok {
					for _, m := range matchups {
						if mMap, ok := m.(map[string]interface{}); ok {
							if franchiseList, ok := mMap["franchise"].([]interface{}); ok {
								for _, f := range franchiseList {
									if fMap, ok := f.(map[string]interface{}); ok {
										if players, ok := fMap["players"].(map[string]interface{}); ok {
											if playerList, ok := players["player"].([]interface{}); ok {
												for _, p := range playerList {
													if pMap, ok := p.(map[string]interface{}); ok {
														if id, ok := pMap["id"].(string); ok {
															idMap[id] = true
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	result := make([]string, 0, len(idMap))
	for id := range idMap {
		result = append(result, id)
	}
	return result
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
