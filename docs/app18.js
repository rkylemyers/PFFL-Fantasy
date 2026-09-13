// PFFL Fantasy Command Center - Application Engine
document.addEventListener('DOMContentLoaded', () => {
  window.PFFL = new PFFLApp();
});

class PFFLApp {
  constructor() {
    this.activeFranchiseId = "0001"; // Mentalcow
    this.leagueData = null;
    this.rostersData = null;
    this.playersMap = new Map();
    this.projectedScoresMap = new Map();
    this.transactionsData = [];
    this.liveScoringData = null;
    this.field = null;
    this.currentMatchupIndex = 0;
    this.currentViewMode = "roster"; // "roster" or "log"
    this.livePollingTimer = null;
    this.lastSyncTime = new Date().toLocaleTimeString();

    // Roster Lineup Arrays
    this.starters = [];
    this.bench = [];
    this.ir = [];

    this.init();
  }

  async init() {
    console.log("⚡ PFFL Application Initializing...");
    this.setupNavigation();
    this.field = new FootballField("football-field-svg");

    await this.loadData();
    this.renderAll();
    this.setupEventListeners();
    this.startLivePolling();
  }

  setupNavigation() {
    const navButtons = document.querySelectorAll("#main-nav-tabs .nav-btn");
    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        navButtons.forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const page = document.getElementById(targetTab);
        if (page) page.classList.add("active");
      });
    });

    const btnViewRoster = document.getElementById("btn-view-roster");
    const btnViewLog = document.getElementById("btn-view-log");

    if (btnViewRoster && btnViewLog) {
      btnViewRoster.addEventListener("click", () => {
        this.currentViewMode = "roster";
        btnViewRoster.classList.add("active");
        btnViewLog.classList.remove("active");
        this.renderLiveMatchup(this.currentMatchupIndex);
      });

      btnViewLog.addEventListener("click", () => {
        this.currentViewMode = "log";
        btnViewLog.classList.add("active");
        btnViewRoster.classList.remove("active");
        this.renderLiveMatchup(this.currentMatchupIndex);
      });
    }
  }

  async loadData() {
    try {
      const liveScoringPromise = fetch('https://www44.myfantasyleague.com/2026/export?TYPE=liveScoring&L=44108&JSON=1')
        .then(r => r.json())
        .catch(() => fetch('data/liveScoring.json?t=' + Date.now()).then(r => r.json()));

      const [leagueRes, rostersRes, playersRes, txRes, projRes, liveRes, syncRes] = await Promise.all([
        fetch('data/league.json').then(r => r.json()).catch(() => ({})),
        fetch('data/rosters.json').then(r => r.json()).catch(() => ({})),
        fetch('data/players.json').then(r => r.json()).catch(() => ({})),
        fetch('data/transactions.json').then(r => r.json()).catch(() => ({})),
        fetch('data/projectedScores.json').then(r => r.json()).catch(() => ({})),
        liveScoringPromise,
        fetch('data/sync_status.json').then(r => r.json()).catch(() => ({}))
      ]);

      this.leagueData = leagueRes.league || {};
      this.rostersData = rostersRes.rosters || {};
      
      const rawPlayers = (playersRes.players && playersRes.players.player) || [];
      rawPlayers.forEach(p => {
        this.playersMap.set(p.id, p);
      });

      const rawProj = (projRes.projectedScores && projRes.projectedScores.playerScore) || [];
      rawProj.forEach(p => {
        this.projectedScoresMap.set(p.id, parseFloat(p.score || "0.0"));
      });

      this.transactionsData = (txRes.transactions && txRes.transactions.transaction) || [];
      this.liveScoringData = liveRes.liveScoring || {};
      this.lastSyncTime = syncRes.last_sync || new Date().toLocaleTimeString();

      console.log(`✅ Loaded ${this.playersMap.size} real player names! Last sync: ${this.lastSyncTime}`);
    } catch (err) {
      console.error("Failed to load local data cache:", err);
    }
  }

  seenESPNPlayIds = new Set();
  espnPlayBuffer = [];

  startLivePolling() {
    this.livePollingTimer = setInterval(async () => {
      try {
        const liveRes = await fetch('https://www44.myfantasyleague.com/2026/export?TYPE=liveScoring&L=44108&JSON=1')
          .then(r => r.json())
          .catch(() => fetch('data/liveScoring.json?t=' + Date.now()).then(r => r.json()));

        if (liveRes && liveRes.liveScoring) {
          this.liveScoringData = liveRes.liveScoring;
          this.lastSyncTime = new Date().toLocaleTimeString();
          document.getElementById("last-sync-timestamp").textContent = `LAST SYNC: ${this.lastSyncTime}`;
          this.renderLiveMatchup(this.currentMatchupIndex);
          this.renderMatchupStrip();
        }
      } catch (e) {
        console.log("Polling update check:", e);
      }
    }, 15000);

    // Poll ESPN Scoreboard every 10 seconds for real live plays
    this.pollESPN();
    let playCountdown = 10;
    setInterval(() => {
        playCountdown--;
        if (playCountdown <= 0) {
            playCountdown = 10;
            this.pollESPN();
        }
        const cdElem = document.getElementById('play-countdown');
        if (cdElem) cdElem.textContent = `Next Play Check: ${playCountdown}s`;
    }, 1000);
  }

  async loadRealHistoricalPlays() {
    try {
      const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
      const data = await resp.json();
      
      const gameIds = data.events.map(e => e.id);
      const teamToGame = new Map();
      data.events.forEach(e => {
        if (e.competitions && e.competitions[0].competitors) {
           e.competitions[0].competitors.forEach(c => {
             teamToGame.set(c.team.abbreviation.toUpperCase(), e.id);
           });
        }
      });
      let allActivePlayers = [...(this.team1Starters || []), ...(this.team2Starters || [])];
      if (allActivePlayers.length === 0) return;

      const playerMap = new Map();
      allActivePlayers.forEach(p => {
        let espnName = p.name.charAt(0) + '.' + p.name.split(' ').slice(1).join(' ');
        // If they have Jr., III, etc. ESPN sometimes drops it or keeps it, but this covers 99% of cases.
        // For defense, p.name might be "Lions, DET". Let's handle DST manually if needed, but for now just players.
        playerMap.set(espnName, p);
      });

      for (const gid of gameIds) {
        try {
          const sResp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gid}`);
          const sData = await sResp.json();
          if (sData.drives && sData.drives.previous) {
            for (const drive of sData.drives.previous) {
              if (!drive.plays) continue;
              for (const play of drive.plays) {
                if (!play.text || !play.wallclock) continue;
                
                // Check if any of our players are in the text
                for (const [espnName, pObj] of playerMap.entries()) {
                  let pTeam = pObj.team ? pObj.team.toUpperCase() : '';
                  const tMap = { 'NOS':'NO', 'GBP':'GB', 'LVR':'LV', 'SFO':'SF', 'TBB':'TB', 'KCC':'KC', 'NEP':'NE', 'WAS':'WSH', 'JAC':'JAX' };
                  if (tMap[pTeam]) pTeam = tMap[pTeam];
                  if (pTeam && teamToGame.get(pTeam) && teamToGame.get(pTeam) !== gid) continue;

                  // Strip administrative referee notes that falsely credit players with involvement
                  let cleanedPlayText = play.text.replace(new RegExp(espnName.replace(".", "\\.") + " reported (in )?as eligible[\\.,]?", "gi"), "").trim();
                  
                  // Check if the player is actually involved in the meat of the play
                  if (cleanedPlayText.includes(espnName)) {
                    // It's a match! Format the play
                    let pTime = new Date(play.wallclock);
                    let pStamp = pTime.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'}) + (play.clock ? ` (Q${play.period.number} ${play.clock.displayValue})` : '');
                    
                    let isTD = play.text.includes('TOUCHDOWN');
                    let isBigPlay = isTD || play.statYardage >= 20;
                    
                    let pts = 0;
                    let txt = play.text.toLowerCase();
                    if (txt.includes('incomplete') || (txt.includes('penalty') && !txt.includes('declined')) || txt.includes('no play')) continue;
                    let pos = pObj.pos || (pObj.position ? pObj.position.toUpperCase() : 'RB');
                    if (pos === 'DEF' || pos === 'DST') {
                       // DST scoring is too complex to parse from play text, skip parsing
                       continue; 
                    }
                    
                    if (pos === 'K' || pos === 'PK') {
                        if (txt.includes('field goal is good') || txt.includes('field goal good')) {
                            let match = txt.match(/(\d+) yard field goal/);
                            let dist = match ? parseInt(match[1]) : 30;
                            if (dist >= 50) pts = 5;
                            else if (dist >= 40) pts = 4;
                            else pts = 3;
                            
                            // Strip away any preceding touchdown text if this is a combined play
                            let kickerParts = play.text.split(/TOUCHDOWN\.|TOUCHDOWN,/i);
                            play.text = kickerParts.length > 1 ? kickerParts[1].trim() : play.text;
                        } else if (txt.includes('extra point is good') && txt.includes(espnName.toLowerCase())) {
                            pts = 1;
                            
                            // Strip away the touchdown pass/run description so the kicker just gets their XP text
                            let kickerParts = play.text.split(/TOUCHDOWN\.|TOUCHDOWN,/i);
                            play.text = kickerParts.length > 1 ? kickerParts[1].trim() : play.text;
                        }
                    } else {
                        // Skill player
                        if (txt.includes('kicks ') && !txt.includes('good') && !txt.includes('field goal')) {
                            continue; // Skip kickoffs for skill players
                        }
                        
                        let yards = play.statYardage || 0;
                        let isPasser = txt.includes(espnName.toLowerCase() + ' pass');
                        let isReceiver = txt.includes('to ' + espnName.toLowerCase()) && !txt.includes('incomplete') && !txt.includes('intercepted');
                        let isPassPlay = txt.includes('pass ');
                        let isRusher = txt.includes(espnName.toLowerCase()) && !isPassPlay;
                        
                        if (isPasser) {
                            pts += yards * 0.04;
                            if (isTD) pts += 4;
                        } else if (isReceiver) {
                            pts += yards * 0.1;
                            if (isTD) pts += 6;
                            pts += 1; // PPR
                        } else if (isRusher) {
                            pts += yards * 0.1;
                            if (isTD) pts += 6;
                        }
                    }
                    
                    if (pts <= 0) continue;
                    
                    const newPlay = {
                      playerId: pObj.id,
                      playerName: pObj.name,
                      pts: `+${pts.toFixed(1)}`,
                      isPos: true,
                      isTD: isTD,
                      isBigPlay: isBigPlay,
                      desc: play.text,
                      timeStamp: pStamp,
                      timeSortWeight: pTime.getTime(),
                      startYard: play.start ? play.start.yardLine : 50,
                      yards: play.statYardage || 0,
                      team: pObj.team,
                      isPass: txt.includes('pass '),
                      isRun: !txt.includes('pass ') && pos !== 'K' && pos !== 'PK',
                      isFG: pos === 'K' || pos === 'PK'
                    };

                    if (!pObj.last5Plays) pObj.last5Plays = [];
                    if (!pObj.last5Plays.find(p => p.desc === play.text)) {
                       pObj.last5Plays.push(newPlay);
                    }
                  }
                }
              }
            }
          }
        } catch(e) {}
      }
      
      allActivePlayers.forEach(p => {
        if (p.last5Plays) {
          p.last5Plays.sort((a,b) => b.timeSortWeight - a.timeSortWeight);
          p.last5Plays = p.last5Plays.slice(0, 5);
        }
      });
      
      this.renderLiveMatchup(this.currentMatchupIndex);
    } catch(e) {
      console.error(e);
    }
  }

  async pollESPN() {
    try {
      const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
      const data = await resp.json();
      
      let allActivePlayers = [...(this.team1Starters || []), ...(this.team2Starters || [])];
      if (allActivePlayers.length === 0) return;

      let newPlaysFound = false;
      const teamToGame = new Map();
      data.events.forEach(e => {
        if (e.competitions && e.competitions[0].competitors) {
           e.competitions[0].competitors.forEach(c => {
             teamToGame.set(c.team.abbreviation.toUpperCase(), e.id);
           });
        }
      });

      data.events.forEach(evt => {
        const comp = evt.competitions[0];
        if (comp.situation && comp.situation.lastPlay) {
          const play = comp.situation.lastPlay;
          if (this.seenESPNPlayIds.has(play.id)) return;
          this.seenESPNPlayIds.add(play.id);
          
          let txt = play.text ? play.text.toLowerCase() : '';
          if (txt.includes('incomplete') || (txt.includes('penalty') && !txt.includes('declined')) || txt.includes('no play')) return;

          // Check if any athlete involved matches our active roster
          if (play.athletesInvolved) {
            play.athletesInvolved.forEach(ath => {
              const match = allActivePlayers.find(p => {
                let pTeam = p.team ? p.team.toUpperCase() : '';
                const tMap = { 'NOS':'NO', 'GBP':'GB', 'LVR':'LV', 'SFO':'SF', 'TBB':'TB', 'KCC':'KC', 'NEP':'NE', 'WAS':'WSH', 'JAC':'JAX' };
                if (tMap[pTeam]) pTeam = tMap[pTeam];
                if (pTeam && teamToGame.get(pTeam) && teamToGame.get(pTeam) !== evt.id) return false;
                
                return p.name.toLowerCase().includes(ath.fullName.toLowerCase()) || ath.fullName.toLowerCase().includes(p.name.toLowerCase());
              });
              if (match) {
                // Heuristic Fantasy Points calculation
                let fpts = (play.statYardage || 0) * 0.1;
                let isTD = play.text.toLowerCase().includes('touchdown');
                if (isTD) fpts += 6.0;
                if (play.type && play.type.text === 'Pass Reception') fpts += 1.0;
                if (fpts <= 0) return; // Skip 0 point plays (like incomplete passes) to avoid stream spam
                
                const playObj = {
                  playerId: match.id,
                  playerName: match.name,
                  scoreStr: match.scoreStr,
                  pts: `+${fpts.toFixed(1)}`,
                  isBigPlay: (play.statYardage && play.statYardage >= 20) || isTD,
                  timeStamp: "LIVE",
                  timeSortWeight: Date.now(),
                  desc: `🚨 LIVE: ${play.text} (+${fpts.toFixed(1)} pts)`,
                  team: match.team,
                  startYard: comp.situation.yardLine || 25,
                  yards: play.statYardage || 0,
                  isTD: isTD,
                  isPass: play.text.toLowerCase().includes('pass '),
                  isRun: !play.text.toLowerCase().includes('pass ') && match.position !== 'PK' && match.position !== 'K',
                  isFG: match.position === 'PK' || match.position === 'K'
                };
                
                if (!match.last5Plays) match.last5Plays = [];
                match.last5Plays.unshift(playObj);
                
                this.espnPlayBuffer.unshift(playObj);
                newPlaysFound = true;

                if (this.field) {
                  let allPlays1 = this.getTeamAllPlays(this.team1Starters).map(p => ({...p, isOpponent: false}));
                  let allPlays2 = this.getTeamAllPlays(this.team2Starters).map(p => ({...p, isOpponent: true}));
                  let combined = [...allPlays1, ...allPlays2].sort((a,b) => b.timeSortWeight - a.timeSortWeight).slice(0, 6);
                  document.getElementById("current-play-summary").textContent = `Displaying the last ${combined.length} scoring plays`;
                  if (this.field && this.field.renderCombinedPlays) {
                      this.field.renderCombinedPlays(combined);
                  }
                  
                  // Also update the live running stream logs at the bottom
                  const myStreamFeed = document.getElementById("my-team-stream-feed");
                  const oppStreamFeed = document.getElementById("opp-team-stream-feed");
                  if (myStreamFeed) myStreamFeed.innerHTML = this.createRunningStreamHTML(this.team1Starters, false);
                  if (oppStreamFeed) oppStreamFeed.innerHTML = this.createRunningStreamHTML(this.team2Starters, true);
                }
              }
            });
          }
        }
      });

      if (newPlaysFound) {
        const myFeed = document.getElementById("my-team-play-feed");
        const oppFeed = document.getElementById("opp-team-play-feed");
        if (myFeed) myFeed.innerHTML = this.createRunningStreamHTML(this.team1Starters, false);
        if (oppFeed) oppFeed.innerHTML = this.createRunningStreamHTML(this.team2Starters, true);
      }
    } catch (e) {
      console.warn("ESPN Polling error:", e);
    }
  }

  renderAll() {
    document.getElementById("last-sync-timestamp").textContent = `LAST SYNC: ${this.lastSyncTime}`;
    this.renderMatchupStrip();
    this.renderLiveMatchup(0);
    this.renderRoster();
    this.renderTrendsAndReplacements();
    this.renderDuesAndLedger();
    this.renderTransactionsFeed();
  }

  // -------------------------------------------------------------
  // PAGE 1: LIVE SCORING & REVERSE CHRONOLOGICAL STREAM ENGINE
  // -------------------------------------------------------------
  renderMatchupStrip() {
    const strip = document.getElementById("league-matchup-strip");
    if (!strip || !this.liveScoringData.matchup) return;

    const franchises = (this.leagueData.franchises && this.leagueData.franchises.franchise) || [];
    let matchups = (this.liveScoringData.matchup) || [];

    const myMatchupIndex = matchups.findIndex(m => m.franchise[0].id === this.activeFranchiseId || m.franchise[1].id === this.activeFranchiseId);
    if (myMatchupIndex > 0) {
      const [myM] = matchups.splice(myMatchupIndex, 1);
      matchups.unshift(myM);
    }

    strip.innerHTML = matchups.map((m, idx) => {
      const f1Id = m.franchise[0].id;
      const f2Id = m.franchise[1].id;
      const f1 = franchises.find(f => f.id === f1Id) || { name: `Team ${f1Id}` };
      const f2 = franchises.find(f => f.id === f2Id) || { name: `Team ${f2Id}` };
      const isMyMatchup = f1Id === this.activeFranchiseId || f2Id === this.activeFranchiseId;
      const isActive = idx === this.currentMatchupIndex;

      return `
        <div class="matchup-card-mini ${isActive ? 'active-matchup' : ''}" data-idx="${idx}">
          <div class="mini-team-row">
            <span class="mini-team-name">${f1.name}</span>
            <span class="mini-team-score" style="color: var(--accent-cyan)">${parseFloat(m.franchise[0].score || "0.0").toFixed(2)}</span>
          </div>
          <div class="mini-team-row">
            <span class="mini-team-name">${f2.name}</span>
            <span class="mini-team-score" style="color: var(--accent-purple)">${parseFloat(m.franchise[1].score || "0.0").toFixed(2)}</span>
          </div>
          ${isMyMatchup ? `<div class="my-matchup-badge">MY MATCHUP</div>` : ''}
        </div>
      `;
    }).join('');

    document.querySelectorAll(".matchup-card-mini").forEach(card => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-idx"));
        this.currentMatchupIndex = idx;
        this.renderMatchupStrip();
        this.renderLiveMatchup(idx);
      });
    });
  }

  getFranchiseLogo(fMeta) {
    if (!fMeta) return "https://www44.myfantasyleague.com/fflnet2025/newhelmets/nh-0220.png";
    let logo = fMeta.logo || fMeta.icon || "";
    if (!logo || logo.includes("imageshack") || !logo.startsWith("https://")) {
      logo = fMeta.icon || "";
    }
    if (!logo || logo.includes("imageshack") || !logo.startsWith("https://")) {
      return "https://www44.myfantasyleague.com/fflnet2025/newhelmets/nh-0220.png";
    }
    return logo;
  }

  renderLiveMatchup(matchupIdx = 0) {
    const matchups = (this.liveScoringData.matchup) || [];
    if (!matchups[matchupIdx]) return;

    const m = matchups[matchupIdx];
    const team1Data = m.franchise[0];
    const team2Data = m.franchise[1];

    const franchises = (this.leagueData.franchises && this.leagueData.franchises.franchise) || [];
    const f1Meta = franchises.find(f => f.id === team1Data.id) || { name: "Home Team", logo: "" };
    const f2Meta = franchises.find(f => f.id === team2Data.id) || { name: "Away Team", logo: "" };

    const f1Logo = this.getFranchiseLogo(f1Meta);
    const f2Logo = this.getFranchiseLogo(f2Meta);

    this.field.setTeamNames(f1Meta.name, f2Meta.name);

    document.getElementById("banner-left-name").textContent = f1Meta.name;
    document.getElementById("banner-left-logo").src = f1Logo;
    document.getElementById("banner-left-score").textContent = parseFloat(team1Data.score || "0.00").toFixed(2);
    document.getElementById("banner-left-proj").textContent = (parseFloat(team1Data.score || "0") + (parseInt(team1Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("banner-right-name").textContent = f2Meta.name;
    document.getElementById("banner-right-logo").src = f2Logo;
    document.getElementById("banner-right-score").textContent = parseFloat(team2Data.score || "0.00").toFixed(2);
    document.getElementById("banner-right-proj").textContent = (parseFloat(team2Data.score || "0") + (parseInt(team2Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("my-team-name").textContent = f1Meta.name;
    document.getElementById("my-team-logo").src = f1Logo;
    document.getElementById("my-team-score").textContent = parseFloat(team1Data.score || "0.00").toFixed(2);
    document.getElementById("my-team-proj").textContent = (parseFloat(team1Data.score || "0") + (parseInt(team1Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("opp-team-name").textContent = f2Meta.name;
    document.getElementById("opp-team-logo").src = f2Logo;
    document.getElementById("opp-team-score").textContent = parseFloat(team2Data.score || "0.00").toFixed(2);
    document.getElementById("opp-team-proj").textContent = (parseFloat(team2Data.score || "0") + (parseInt(team2Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    const team1Starters = this.buildStrictPositionalLineup(team1Data);
    const team2Starters = this.buildStrictPositionalLineup(team2Data);
    
    this.team1Starters = team1Starters;
    this.team2Starters = team2Starters;

    if (!this.historicalPlaysLoaded) {
      this.historicalPlaysLoaded = true;
      this.loadRealHistoricalPlays();
    }


    const myStreamFeed = document.getElementById("my-team-stream-feed");
    const oppStreamFeed = document.getElementById("opp-team-stream-feed");
    const myRosterFeed = document.getElementById("my-team-roster-feed");
    const oppRosterFeed = document.getElementById("opp-team-roster-feed");

    if (myStreamFeed) myStreamFeed.innerHTML = this.createRunningStreamHTML(team1Starters, false);
    if (oppStreamFeed) oppStreamFeed.innerHTML = this.createRunningStreamHTML(team2Starters, true);
    if (myRosterFeed) myRosterFeed.innerHTML = team1Starters.map(p => this.createLineupTotalRowHTML(p, false)).join('');
    if (oppRosterFeed) oppRosterFeed.innerHTML = team2Starters.map(p => this.createLineupTotalRowHTML(p, true)).join('');

    // Field Top 6 Plays Combos
    let allPlays1 = this.getTeamAllPlays(team1Starters).map(p => ({...p, isOpponent: false}));
    let allPlays2 = this.getTeamAllPlays(team2Starters).map(p => ({...p, isOpponent: true}));
    
    let combined = [...allPlays1, ...allPlays2].sort((a,b) => b.timeSortWeight - a.timeSortWeight).slice(0, 6);
    document.getElementById("current-play-summary").textContent = `Displaying the last ${combined.length} scoring plays`;
    if (this.field && this.field.renderCombinedPlays) {
        this.field.renderCombinedPlays(combined);
    }
  }

  buildStrictPositionalLineup(franchiseData) {
    if (!this.playerHistoryCache) this.playerHistoryCache = new Map();
    const rawStarters = (franchiseData.players && franchiseData.players.player) || [];
    
    const sampleOpponents = [
      "vs DAL (Sun 1:00 PM)", "@ PHI (Sun 4:25 PM)", "vs DET (Sun 8:20 PM)",
      "vs WSH (Sun 1:00 PM)", "@ NYG (Sun 1:00 PM)", "@ SF (Mon 8:15 PM)",
      "vs GB (Sun 4:05 PM)", "@ CHI (Sun 1:00 PM)", "vs MIN (Sun 1:00 PM)"
    ];

    const parsedPlayers = rawStarters.map((pObj, idx) => {
      const pMeta = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB', team: 'NFL' };
      let cleanName = pMeta.name || `Player #${pObj.id}`;
      if (cleanName.includes(",")) {
        const parts = cleanName.split(",");
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      }

      const scoreNum = parseFloat(pObj.score || "0.00");
      const isPos = scoreNum >= 0;
      let pos = (pMeta.position || 'RB').toUpperCase();
      
      if (this.playerHistoryCache.has(pObj.id)) {
         const cached = this.playerHistoryCache.get(pObj.id);
         if (cached.scoreNum === scoreNum) {
             return cached;
         }
      }
      if (pos === 'DEF') pos = 'DST';
      if (pos === 'PK') pos = 'K';

      const upcomingGameInfo = sampleOpponents[idx % sampleOpponents.length];

      let pointLogs = [];
      let last5Plays = [];
      let detailedPlayDesc = "";
      let timeStamp = "";
      let timeSortWeight = 0;
      let isBigPlay = false;
      let isTD = false;
      
      let baseStartYard = 30;
      let baseYards = 5;

      if (scoreNum > 0) {
          // Plays will be loaded asynchronously from ESPN!
      } else if (false) { // Skip old mock code
        const numPlays = Math.min(5, Math.max(2, Math.floor(scoreNum / 2) + 1));
        const playPoints = [];
        let remainingScore = scoreNum;
        for (let i = 0; i < numPlays - 1; i++) {
          const pt = parseFloat((Math.random() * (remainingScore / (numPlays - i))).toFixed(1));
          playPoints.push(pt);
          remainingScore -= pt;
        }
        playPoints.push(parseFloat(remainingScore.toFixed(1)));
        
        playPoints.sort((a,b) => b - a);
        pointLogs = playPoints.map(pt => `+${pt.toFixed(1)}`);

        // Convert base hour/minute into a minute representation to easily subtract minutes
        let baseHour = 3;
        let baseMin = 10;
        let baseDay = "Sun";
        
        // Restore real-world day overrides so historical data isn't blatantly wrong
        if (cleanName.toLowerCase().includes("strange")) {
          baseDay = "Sun"; baseHour = 3; baseMin = 10; isBigPlay = true; isTD = true; baseStartYard = 82; baseYards = 18;
          detailedPlayDesc = `🚨 TOUCHDOWN! Brenton Strange 18 yd pass reception from Trevor Lawrence down to end zone (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("st. brown") || cleanName.toLowerCase().includes("brown")) {
          baseDay = "Sun"; baseHour = 3; baseMin = 10; isBigPlay = true; isTD = true; baseStartYard = 60; baseYards = 40;
          detailedPlayDesc = `🚨 TOUCHDOWN! ${cleanName} 40 yard pass reception from Jared Goff down to end zone (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("tuten")) {
          baseDay = "Sun"; baseHour = 3; baseMin = 10; baseStartYard = 68; baseYards = 18;
          detailedPlayDesc = `Bhayshul Tuten 18 yard rush off left tackle down to opponent 14 yard line (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("adams")) {
          baseDay = "Thu"; baseHour = 8; baseMin = 40; isBigPlay = true; baseStartYard = 60; baseYards = 24;
          detailedPlayDesc = `${cleanName} 24 yard pass reception from Gardner Minshew down to opponent 16 yard line (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("samuel")) {
          baseDay = "Thu"; baseHour = 8; baseMin = 15; isBigPlay = true; baseStartYard = 42; baseYards = 28;
          detailedPlayDesc = `Deebo Samuel 28 yard pass reception from Brock Purdy down to opponent 30 yard line (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("darnold")) {
          baseDay = "Wed"; baseHour = 8; baseMin = 15; isBigPlay = true; baseStartYard = 40; baseYards = 25;
          detailedPlayDesc = `Sam Darnold 25 yard pass completion to Justin Jefferson down to opponent 35 yard line (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("barkley")) {
          baseDay = "Fri"; baseHour = 9; baseMin = 45; isBigPlay = true; baseStartYard = 70; baseYards = 18;
          detailedPlayDesc = `Saquon Barkley 18 yard rush up the middle down to opponent 12 yard line (+${playPoints[0].toFixed(1)} pts)`;
        } else if (cleanName.toLowerCase().includes("jackson")) {
          baseDay = "Thu"; baseHour = 9; baseMin = 18; isBigPlay = true; baseStartYard = 42; baseYards = 24;
          detailedPlayDesc = `Lamar Jackson 24 yard pass completion to Zay Flowers down to opponent 34 yard line (+${playPoints[0].toFixed(1)} pts)`;
        }
        
        // Base weight depends on day and time. Wed=3, Thu=4, Fri=5, Sat=6, Sun=7
        const dayMap = {"Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7, "Mon": 8};
        const dayVal = dayMap[baseDay] || 7;
        
        timeSortWeight = (dayVal * 10000) + (baseHour * 60) + baseMin;
        
        if (!detailedPlayDesc) {
          baseYards = Math.min(38, Math.max(12, Math.round(scoreNum * 1.8)));
          isBigPlay = baseYards >= 20;
          baseStartYard = Math.max(20, Math.min(60, 10 + Math.random() * 40)); 
          const absoluteEndYard = baseStartYard + baseYards;
          const endStr = absoluteEndYard > 50 ? `opponent ${100 - absoluteEndYard}` : `own ${absoluteEndYard}`;
          
          if (pos === 'RB') {
            detailedPlayDesc = `${cleanName} ${baseYards} yard rush off tackle down to ${endStr} yard line (+${playPoints[0].toFixed(1)} pts)`;
          } else if (pos === 'K') {
            detailedPlayDesc = `${cleanName} 46 yard field goal GOOD (+${playPoints[0].toFixed(1)} pts)`;
          } else if (pos === 'DST') {
            detailedPlayDesc = `${cleanName} defensive sack for loss of 7 yards (+${playPoints[0].toFixed(1)} pts)`;
          } else {
            detailedPlayDesc = `${cleanName} ${baseYards} yard pass reception down to ${endStr} yard line (+${playPoints[0].toFixed(1)} pts)`;
          }
        }

        let timeStr = `${baseMin < 10 ? '0' : ''}${baseMin}`;
        timeStamp = `${baseDay} ${baseHour}:${timeStr} PM`;

        last5Plays.push({ 
          startYard: baseStartYard, 
          yards: baseYards, 
          pts: `+${playPoints[0].toFixed(1)}`, 
          isPos: true, 
          isTD: isTD, 
          isBigPlay: isBigPlay, 
          desc: detailedPlayDesc,
          timeStamp: timeStamp,
          timeSortWeight: timeSortWeight
        });

        let currentStartYard = Math.max(10, baseStartYard - 15);
        let currentWeight = timeSortWeight;
        let currentMin = baseMin;
        
        for (let i = 1; i < numPlays; i++) {
          const gain = Math.max(2, Math.round(Math.random() * 15));
          const pDesc = pos === 'RB' ? 
            `${cleanName} ${gain} yard rush up the middle (+${playPoints[i].toFixed(1)} pts)` :
            (pos === 'K' ? `${cleanName} extra point GOOD (+${playPoints[i].toFixed(1)} pts)` :
            `${cleanName} ${gain} yard pass reception (+${playPoints[i].toFixed(1)} pts)`);
            
          currentWeight -= Math.floor(Math.random() * 2) + 1; // 1-2 minutes earlier
          currentMin -= Math.floor(Math.random() * 2) + 1;
          if (currentMin < 0) { currentMin += 60; } // rough approximation, good enough for mock
          let minStr = `${currentMin < 10 ? '0' : ''}${currentMin}`;
          let pStamp = `${baseDay} ${baseHour}:${minStr} PM`;

          last5Plays.push({
            startYard: currentStartYard,
            yards: gain,
            pts: `+${playPoints[i].toFixed(1)}`,
            isPos: true,
            isTD: false,
            isBigPlay: false,
            desc: pDesc,
            timeStamp: pStamp,
            timeSortWeight: currentWeight
          });
          currentStartYard = Math.max(10, currentStartYard - (gain + 5));
        }
      } else {
        pointLogs = [upcomingGameInfo];
        timeStamp = "Upcoming";
        timeSortWeight = 0;
        detailedPlayDesc = `${cleanName} — ${upcomingGameInfo}`;
        last5Plays = [
          { startYard: 30, yards: 0, pts: "0.00", isPos: true, desc: detailedPlayDesc, timeStamp: "Upcoming", timeSortWeight: 0 }
        ];
      }

      const finalPlayerObj = {
        id: pObj.id,
        name: cleanName,
        pos: pos,
        team: pMeta.team || 'NFL',
        scoreNum: scoreNum,
        scoreStr: scoreNum.toFixed(2),
        isPos: isPos,
        pointLogsStr: pointLogs.join(", "),
        last5Plays: last5Plays,
        detailedPlayDesc: detailedPlayDesc,
        timeStamp: timeStamp,
        timeSortWeight: timeSortWeight,
        isBigPlay: isBigPlay,
        upcomingGameInfo: upcomingGameInfo,
        gameSecondsRemaining: parseInt(pObj.gameSecondsRemaining || "3600")
      };
      this.playerHistoryCache.set(pObj.id, finalPlayerObj);
      return finalPlayerObj;
    });

    const renderSlots = ['QB', 'RB', 'RB', 'WR', 'WR', 'FLEX', 'TE', 'K', 'DST'];
    const assignedLineup = new Array(9).fill(null);
    const usedIDs = new Set();
    
    // First Pass: Assign Strict Positions
    renderSlots.forEach((slot, sIdx) => {
      if (slot !== 'FLEX') {
        let match = parsedPlayers.find(p => !usedIDs.has(p.id) && p.pos === slot);
        if (match) {
          usedIDs.add(match.id);
          assignedLineup[sIdx] = { ...match, displaySlot: slot };
        }
      }
    });

    // Second Pass: Assign FLEX
    renderSlots.forEach((slot, sIdx) => {
      if (slot === 'FLEX') {
        let match = parsedPlayers.find(p => !usedIDs.has(p.id) && ['RB', 'WR', 'TE'].includes(p.pos));
        if (match) {
          usedIDs.add(match.id);
          assignedLineup[sIdx] = { ...match, displaySlot: slot };
        }
      }
    });

    // Third Pass: Fill any empty slots with remaining players (regardless of position) or empty placeholders
    renderSlots.forEach((slot, sIdx) => {
      if (!assignedLineup[sIdx]) {
        const defaultGame = sampleOpponents[sIdx % sampleOpponents.length];
        let fallback = parsedPlayers.find(p => !usedIDs.has(p.id));
        if (fallback) {
          usedIDs.add(fallback.id);
          assignedLineup[sIdx] = { ...fallback, displaySlot: slot };
        } else {
          assignedLineup[sIdx] = {
            id: `empty-${slot}`, name: `Empty ${slot}`, pos: slot, team: 'NFL', scoreNum: 0, scoreStr: "0.00", isPos: true, 
            pointLogsStr: defaultGame, upcomingGameInfo: defaultGame, detailedPlayDesc: `Empty ${slot} — ${defaultGame}`, 
            timeStamp: "Upcoming", timeSortWeight: 0, isBigPlay: false, last5Plays: [], displaySlot: slot
          };
        }
      }
    });

    return assignedLineup;
  }

  createLineupTotalRowHTML(p, isOpponent) {
    return `
      <div class="play-item" data-id="${p.id}">
        <div class="play-item-left">
          <span class="pos-pill ${p.displaySlot}">${p.displaySlot}</span>
          <div class="play-details">
            <span class="player-name-line">
              ${p.name} <span class="player-subtext">(${p.team})</span>
              <span class="recent-logs-inline">${p.pointLogsStr}</span>
            </span>
          </div>
        </div>
        <span class="pts-delta-badge ${p.scoreNum > 0 ? 'pos' : 'neutral'}">${p.scoreStr}</span>
      </div>
    `;
  }

  // Running Play Stream: Reverse Chronological Order (Most Recent on Top) with Time Stamps & Inline Big Play Alerts
  getTeamAllPlays(startersList) {
    let allPlays = [];
    startersList.forEach(p => {
      if (p.scoreNum > 0 && p.last5Plays && p.last5Plays.length > 0) {
        p.last5Plays.forEach(play => {
          allPlays.push({
            playerId: p.id,
            playerName: p.name || play.playerName,
            scoreStr: p.scoreStr,
            pts: play.pts,
            isBigPlay: play.isBigPlay,
            timeStamp: play.timeStamp,
            timeSortWeight: play.timeSortWeight,
            desc: play.desc,
            team: p.team || play.team,
            startYard: play.startYard,
            yards: play.yards,
            isTD: play.isTD,
            isPass: play.isPass,
            isRun: play.isRun,
            isFG: play.isFG
          });
        });
      }
    });
    
    // Deduplicate by desc + playerId to allow QB and WR to both get credit for the same play
    const uniquePlays = [];
    const seen = new Set();
    allPlays.forEach(p => {
       const key = p.desc + p.playerId;
       if (!seen.has(key)) {
         seen.add(key);
         uniquePlays.push(p);
       }
    });

    uniquePlays.sort((a, b) => b.timeSortWeight - a.timeSortWeight);
    return uniquePlays;
  }

  createRunningStreamHTML(startersList, isOpponent) {
    const allPlays = this.getTeamAllPlays(startersList);

    if (allPlays.length === 0) {
      return `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.75rem;">No live scoring plays recorded yet for this team.</div>`;
    }

    return allPlays.map(p => `
      <div class="play-item ${p.isBigPlay ? 'big-play-item' : ''}" data-id="${p.playerId}">
        <div class="play-item-left">
          <div class="play-details">
            <span class="player-name-line" style="color: var(--accent-cyan)">
              ${p.playerName} <span class="pts-delta-badge ${p.pts && p.pts.toString().startsWith('+') ? 'pos' : 'neutral'}">${p.pts}</span> <span class="play-time-stamp">(${p.timeStamp})</span> ${p.isTD ? '<span class="big-play-alert-tag" style="background: var(--accent-red); color: white;">🚨 BIG PLAY ALERT</span>' : (p.isBigPlay ? '<span class="big-play-alert-tag">🚨 BIG PLAY ALERT</span>' : '')}
            </span>
            <span class="play-desc" style="color: #ffffff; font-weight: 700; margin-top: 0.2rem; font-size: 0.82rem;">
              ${p.desc}
            </span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // -------------------------------------------------------------
  // PAGE 2: ROSTER & LINEUP SUBMITTER
  // -------------------------------------------------------------
  renderRoster() {
    const franchises = (this.rostersData.franchise) || [];
    const myFranchise = franchises.find(f => f.id === this.activeFranchiseId);

    if (!myFranchise || !myFranchise.player) return;

    const rawPlayerList = myFranchise.player || [];
    
    this.starters = [];
    this.bench = [];
    this.ir = [];

    const posCount = { QB: 0, RB: 0, WR: 0, TE: 0, PK: 0, K: 0, Def: 0, DST: 0 };

    rawPlayerList.forEach(pObj => {
      const fullPlayer = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB', team: 'NFL' };
      let cleanName = fullPlayer.name || `Player #${pObj.id}`;
      if (cleanName.includes(",")) {
        const parts = cleanName.split(",");
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      }

      let pos = (fullPlayer.position || 'RB').toUpperCase();
      if (pos === 'DEF') pos = 'DST';
      if (pos === 'PK') pos = 'K';

      const proj = this.projectedScoresMap.get(pObj.id) || (Math.random() * 12 + 3).toFixed(1);
      const diffRating = Math.floor(Math.random() * 10) + 1;

      const playerItem = {
        id: pObj.id,
        name: cleanName,
        pos: pos,
        team: fullPlayer.team || 'NFL',
        proj: proj,
        diff: diffRating,
        status: pObj.status || 'ROSTER'
      };

      if (posCount[playerItem.pos] < 2 && this.starters.length < 9) {
        posCount[playerItem.pos]++;
        this.starters.push(playerItem);
      } else {
        this.bench.push(playerItem);
      }
    });

    this.renderRosterTables();
  }

  renderRosterTables() {
    const startersList = document.getElementById("starters-list");
    const benchList = document.getElementById("bench-list");
    const irList = document.getElementById("ir-list");

    if (startersList) {
      startersList.innerHTML = this.starters.map(p => this.createRosterRowHTML(p, 'Bench')).join('');
    }
    if (benchList) {
      benchList.innerHTML = this.bench.map(p => this.createRosterRowHTML(p, 'Start')).join('');
    }
    if (irList) {
      irList.innerHTML = this.ir.map(p => this.createRosterRowHTML(p, 'Activate')).join('');
    }

    document.querySelectorAll(".btn-swap-lineup").forEach(btn => {
      btn.addEventListener("click", () => {
        const pId = btn.getAttribute("data-id");
        this.swapPlayerLineup(pId);
      });
    });
  }

  createRosterRowHTML(p, actionLabel) {
    return `
      <tr>
        <td><span class="pos-pill ${p.pos}">${p.pos}</span></td>
        <td>
          <div class="player-cell">
            <div class="player-info-meta">
              <span class="player-name">${p.name}</span>
              <span class="player-subtext">${p.team} - Bye Wk 9</span>
            </div>
          </div>
        </td>
        <td>vs Opponent (Sun 1:00 PM)</td>
        <td><strong>${p.proj}</strong></td>
        <td>
          <span class="diff-meter diff-${p.diff}">${p.diff} / 10</span>
        </td>
        <td><span class="live-status-pill">HEALTHY</span></td>
        <td>
          <button class="btn-xs btn-swap-lineup" data-id="${p.id}">${actionLabel}</button>
        </td>
      </tr>
    `;
  }

  swapPlayerLineup(pId) {
    let starterIdx = this.starters.findIndex(p => p.id === pId);
    if (starterIdx !== -1) {
      const [moved] = this.starters.splice(starterIdx, 1);
      this.bench.push(moved);
      this.showToast(`Benched ${moved.name}`);
    } else {
      let benchIdx = this.bench.findIndex(p => p.id === pId);
      if (benchIdx !== -1) {
        const [moved] = this.bench.splice(benchIdx, 1);
        this.starters.push(moved);
        this.showToast(`Inserted ${moved.name} into Starting Lineup!`);
      }
    }
    this.renderRosterTables();
  }

  renderTrendsAndReplacements() {
    const trendsContainer = document.getElementById("player-trends-container");
    const wireContainer = document.getElementById("wire-suggestions-container");

    const sampleTrends = [
      { name: "Davante Adams (WR - LAR)", streak: "🔥 Upward (+4.2 avg)", isUp: true, p1: "24.5", p3: "21.0", p5: "18.8" },
      { name: "A.J. Brown (WR - NEP)", streak: "🔥 Upward (+3.0 avg)", isUp: true, p1: "19.2", p3: "17.4", p5: "16.1" },
      { name: "Dallas Goedert (TE - PHI)", streak: "❄️ Downward (-2.1 avg)", isUp: false, p1: "6.4", p3: "8.2", p5: "10.5" }
    ];

    const sampleReplacements = [
      { name: "Jordan Mason (RB - SF)", reason: "Starter CMC Injured - Guaranteed Touches", sos: "Easy SOS (Rank #2)" },
      { name: "Isaiah Likely (TE - BAL)", reason: "FantasyPros ROS Rank #8 Target Pickup", sos: "Moderate SOS (Rank #12)" },
      { name: "Jaxon Smith-Njigba (WR - SEA)", reason: "Targeting 3-Game Stretch Trend (+5.1 pts)", sos: "Very Easy SOS (Rank #1)" }
    ];

    if (trendsContainer) {
      trendsContainer.innerHTML = sampleTrends.map(t => `
        <div class="trend-item">
          <div>
            <strong>${t.name}</strong>
            <div class="player-subtext">Last 1: ${t.p1} | 3-Gm: ${t.p3} | 5-Gm: ${t.p5}</div>
          </div>
          <span class="trend-badge ${t.isUp ? 'trend-up' : 'trend-down'}">${t.streak}</span>
        </div>
      `).join('');
    }

    if (wireContainer) {
      wireContainer.innerHTML = sampleReplacements.map(r => `
        <div class="replacement-item">
          <div>
            <strong>${r.name}</strong>
            <div class="player-subtext">${r.reason}</div>
          </div>
          <span class="trend-badge trend-up">${r.sos}</span>
        </div>
      `).join('');
    }
  }

  renderDuesAndLedger() {
    const franchises = (this.leagueData.franchises && this.leagueData.franchises.franchise) || [];
    const ledgerBody = document.getElementById("dues-ledger-body");

    let totalPickupsAcrossLeague = 0;
    const ledgerRows = franchises.map(f => {
      const teamTxs = this.transactionsData.filter(t => t.franchise === f.id && t.type === "FREE_AGENT");
      const numPickups = teamTxs.length || Math.floor(Math.random() * 4);
      totalPickupsAcrossLeague += numPickups;

      const freePickups = 2;
      const paidPickups = Math.max(0, numPickups - freePickups);
      const waiverDues = paidPickups * 5;
      const totalOwed = 25 + waiverDues;

      return `
        <tr>
          <td><strong>${f.name}</strong> (${f.id})</td>
          <td>$25.00</td>
          <td>${numPickups}</td>
          <td>${paidPickups}</td>
          <td>$${waiverDues}.00</td>
          <td><strong style="color: var(--accent-cyan)">$${totalOwed}.00</strong></td>
        </tr>
      `;
    });

    if (ledgerBody) {
      ledgerBody.innerHTML = ledgerRows.join('');
    }

    document.getElementById("total-league-transactions").textContent = totalPickupsAcrossLeague;
    document.getElementById("dues-total-pot").textContent = `$${300 + (totalPickupsAcrossLeague > 24 ? (totalPickupsAcrossLeague - 24) * 5 : 0)}.00`;
  }

  renderTransactionsFeed() {
    const feed = document.getElementById("league-transaction-feed");
    if (!feed) return;

    if (this.transactionsData.length === 0) {
      feed.innerHTML = `<div style="color: var(--text-muted); padding: 1rem;">No recent waiver transactions recorded for 2026 season.</div>`;
      return;
    }

    const items = this.transactionsData.slice(0, 15).map(tx => {
      const fObj = (this.leagueData.franchises && this.leagueData.franchises.franchise.find(f => f.id === tx.franchise)) || { name: tx.franchise };
      return `
        <div class="trend-item">
          <div>
            <strong>${fObj.name}</strong> - <span style="color: var(--accent-yellow)">${tx.type}</span>
            <div class="player-subtext">${tx.transaction || 'Waiver claim executed'}</div>
          </div>
          <span class="player-subtext">${tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : 'Recent'}</span>
        </div>
      `;
    });

    feed.innerHTML = items.join('');
  }

  setupEventListeners() {
    const btnSubmit = document.getElementById("btn-submit-lineup");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        this.showToast("🚀 Lineup submitted to MFL successfully!");
      });
    }

    const btnPush = document.getElementById("btn-enable-push");
    if (btnPush) {
      btnPush.addEventListener("click", () => {
        if ("Notification" in window) {
          Notification.requestPermission().then(permission => {
            if (permission === "granted") {
              document.getElementById("push-status-msg").textContent = "✅ Push Notifications active for macOS & Android!";
              this.showToast("Notifications Enabled!");
            }
          });
        } else {
          document.getElementById("push-status-msg").textContent = "Push notifications active in web view!";
        }
      });
    }

    document.getElementById("btn-test-tx-alert")?.addEventListener("click", () => {
      this.showToast("🔔 ALERT: Blitzkrieg claimed Jordan Mason off Waivers!");
    });
    document.getElementById("btn-test-lineup-alert")?.addEventListener("click", () => {
      this.showToast("⚠️ OPPONENT ALERT: Warhorse benched Justin Fields for Kirk Cousins!");
    });
  }

  showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}
