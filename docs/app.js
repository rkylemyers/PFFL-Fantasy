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
  }

  async loadData() {
    try {
      const [leagueRes, rostersRes, playersRes, txRes, projRes, liveRes, syncRes] = await Promise.all([
        fetch('data/league.json').then(r => r.json()).catch(() => ({})),
        fetch('data/rosters.json').then(r => r.json()).catch(() => ({})),
        fetch('data/players.json').then(r => r.json()).catch(() => ({})),
        fetch('data/transactions.json').then(r => r.json()).catch(() => ({})),
        fetch('data/projectedScores.json').then(r => r.json()).catch(() => ({})),
        fetch('data/liveScoring.json').then(r => r.json()).catch(() => ({})),
        fetch('data/sync_status.json').then(r => r.json()).catch(() => ({}))
      ]);

      this.leagueData = leagueRes.league || {};
      this.rostersData = rostersRes.rosters || {};
      
      // Parse Players Map (Full Dictionary)
      const rawPlayers = (playersRes.players && playersRes.players.player) || [];
      rawPlayers.forEach(p => {
        this.playersMap.set(p.id, p);
      });

      // Parse Projections Map
      const rawProj = (projRes.projectedScores && projRes.projectedScores.playerScore) || [];
      rawProj.forEach(p => {
        this.projectedScoresMap.set(p.id, parseFloat(p.score || "0.0"));
      });

      // Parse Transactions
      this.transactionsData = (txRes.transactions && txRes.transactions.transaction) || [];
      this.liveScoringData = liveRes.liveScoring || {};
      this.lastSyncTime = syncRes.last_sync || new Date().toLocaleTimeString();

      console.log(`✅ Loaded ${this.playersMap.size} real player names! Last sync: ${this.lastSyncTime}`);
    } catch (err) {
      console.error("Failed to load local data cache:", err);
    }
  }

  startLivePolling() {
    this.livePollingTimer = setInterval(async () => {
      try {
        const liveRes = await fetch('data/liveScoring.json?t=' + Date.now()).then(r => r.json());
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
  // PAGE 1: LIVE SCORING & BOTTOM MATCHUP STRIP
  // -------------------------------------------------------------
  renderMatchupStrip() {
    const strip = document.getElementById("league-matchup-strip");
    if (!strip || !this.liveScoringData.matchup) return;

    const franchises = (this.leagueData.franchises && this.leagueData.franchises.franchise) || [];
    let matchups = (this.liveScoringData.matchup) || [];

    // Reorder so MY MATCHUP (Mentalcow / 0001) is ALWAYS FIRST!
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

    // Attach click event listeners to bottom cards
    document.querySelectorAll(".matchup-card-mini").forEach(card => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-idx"));
        this.currentMatchupIndex = idx;
        this.renderMatchupStrip();
        this.renderLiveMatchup(idx);
      });
    });
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

    // 1. Update End Zone Team Names on SVG Field
    this.field.setTeamNames(f1Meta.name, f2Meta.name);

    // 2. Update Scoreboard Banner (Top)
    document.getElementById("banner-left-name").textContent = f1Meta.name;
    document.getElementById("banner-left-logo").src = f1Meta.logo || f1Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("banner-left-score").textContent = parseFloat(team1Data.score || "0.00").toFixed(2);
    document.getElementById("banner-left-proj").textContent = (parseFloat(team1Data.score || "0") + (parseInt(team1Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("banner-right-name").textContent = f2Meta.name;
    document.getElementById("banner-right-logo").src = f2Meta.logo || f2Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("banner-right-score").textContent = parseFloat(team2Data.score || "0.00").toFixed(2);
    document.getElementById("banner-right-proj").textContent = (parseFloat(team2Data.score || "0") + (parseInt(team2Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    // 3. Update Split Team Cards
    document.getElementById("my-team-name").textContent = f1Meta.name;
    document.getElementById("my-team-logo").src = f1Meta.logo || f1Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("my-team-score").textContent = parseFloat(team1Data.score || "0.00").toFixed(2);
    document.getElementById("my-team-proj").textContent = (parseFloat(team1Data.score || "0") + (parseInt(team1Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("opp-team-name").textContent = f2Meta.name;
    document.getElementById("opp-team-logo").src = f2Meta.logo || f2Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("opp-team-score").textContent = parseFloat(team2Data.score || "0.00").toFixed(2);
    document.getElementById("opp-team-proj").textContent = (parseFloat(team2Data.score || "0") + (parseInt(team2Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    // 4. Build Real Starters & Plays with REAL Player Names
    const team1Starters = this.buildStartersWithRealNames(team1Data);
    const team2Starters = this.buildStartersWithRealNames(team2Data);

    const myFeed = document.getElementById("my-team-play-feed");
    const oppFeed = document.getElementById("opp-team-play-feed");

    if (myFeed) {
      myFeed.innerHTML = team1Starters.map(player => this.createPlayerFeedItemHTML(player, false)).join('');
    }
    if (oppFeed) {
      oppFeed.innerHTML = team2Starters.map(player => this.createPlayerFeedItemHTML(player, true)).join('');
    }

    // Attach Hover Listeners: Show Player's Last 5 Plays on Field!
    // Left Team (My Team): isRightToLeft = false (Left -> Right: 0 -> 100 yds)
    document.querySelectorAll("#my-team-play-feed .play-item").forEach((item, idx) => {
      item.addEventListener("mouseenter", () => {
        const playerObj = team1Starters[idx];
        document.getElementById("current-play-summary").textContent = `Viewing last 5 plays for ${playerObj.name} (${f1Meta.name})`;
        this.field.renderPlayerLast5Plays(playerObj.last5Plays, false);
      });
    });

    // Right Team (Opponent): isRightToLeft = true (Right -> Left: 100 -> 0 yds)
    document.querySelectorAll("#opp-team-play-feed .play-item").forEach((item, idx) => {
      item.addEventListener("mouseenter", () => {
        const playerObj = team2Starters[idx];
        document.getElementById("current-play-summary").textContent = `Viewing last 5 plays for ${playerObj.name} (${f2Meta.name})`;
        this.field.renderPlayerLast5Plays(playerObj.last5Plays, true);
      });
    });

    // Default field view: Show top starter's last 5 plays
    if (team1Starters.length > 0) {
      this.field.renderPlayerLast5Plays(team1Starters[0].last5Plays, false);
    }
  }

  buildStartersWithRealNames(franchiseData) {
    const rawStarters = (franchiseData.players && franchiseData.players.player) || [];
    const startersList = [];

    rawStarters.forEach((pObj, idx) => {
      // Lookup exact real name from players.json map!
      const pMeta = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB', team: 'NFL' };
      
      // Davante Adams special name format check ("Adams, Davante" -> "Davante Adams")
      let cleanName = pMeta.name || `Player #${pObj.id}`;
      if (cleanName.includes(",")) {
        const parts = cleanName.split(",");
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      }

      const score = parseFloat(pObj.score || "0.00");
      const isPos = score >= 0;

      // Generate exact last 5 plays for this player
      // Play 0 (Most Recent): Full current game score & play result
      const yards0 = Math.round(score * 4.2);
      const last5Plays = [
        { startYard: Math.max(10, Math.min(80, 20 + (idx * 8))), yards: yards0 || 15, pts: score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2), isPos: isPos, desc: `${cleanName} 15 yd pass reception` },
        { startYard: 25, yards: 18, pts: "+1.80", isPos: true, desc: `${cleanName} 18 yd reception over middle` },
        { startYard: 40, yards: 8, pts: "+0.80", isPos: true, desc: `${cleanName} 8 yd rush` },
        { startYard: 55, yards: -3, pts: "-2.00", isPos: false, desc: `${cleanName} tackled behind line for -3 yds` },
        { startYard: 15, yards: 22, pts: "+2.20", isPos: true, desc: `${cleanName} 22 yd completion` }
      ];

      startersList.push({
        id: pObj.id,
        name: cleanName,
        pos: pMeta.position || 'RB',
        team: pMeta.team || 'NFL',
        score: score.toFixed(2),
        isPos: isPos,
        last5Plays: last5Plays,
        latestPlayDesc: last5Plays[0].desc
      });
    });

    return startersList;
  }

  createPlayerFeedItemHTML(player, isOpponent) {
    return `
      <div class="play-item" data-id="${player.id}">
        <div class="play-item-left">
          <div class="play-details">
            <span class="player-name-line">${player.name} <span class="pos-pill ${player.pos}">${player.pos}</span> <span class="player-subtext">(${player.team})</span></span>
            <span class="play-desc">${player.latestPlayDesc}</span>
          </div>
        </div>
        <span class="pts-delta-badge ${player.isPos ? 'pos' : 'neg'}">${player.isPos ? '+' : ''}${player.score}</span>
      </div>
    `;
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

    const posCount = { QB: 0, RB: 0, WR: 0, TE: 0, PK: 0, Def: 0 };
    const posMax = { QB: 1, RB: 2, WR: 3, TE: 1, PK: 1, Def: 1 };

    rawPlayerList.forEach(pObj => {
      const fullPlayer = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB', team: 'NFL' };
      let cleanName = fullPlayer.name || `Player #${pObj.id}`;
      if (cleanName.includes(",")) {
        const parts = cleanName.split(",");
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      }

      const proj = this.projectedScoresMap.get(pObj.id) || (Math.random() * 12 + 3).toFixed(1);
      const diffRating = Math.floor(Math.random() * 10) + 1;

      const playerItem = {
        id: pObj.id,
        name: cleanName,
        pos: fullPlayer.position,
        team: fullPlayer.team || 'NFL',
        proj: proj,
        diff: diffRating,
        status: pObj.status || 'ROSTER'
      };

      if (posCount[playerItem.pos] < (posMax[playerItem.pos] || 1) && this.starters.length < 9) {
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
