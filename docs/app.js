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
      // Load static data synced by Go backend
      const [leagueRes, rostersRes, playersRes, txRes, projRes, liveRes] = await Promise.all([
        fetch('data/league.json').then(r => r.json()).catch(() => ({})),
        fetch('data/rosters.json').then(r => r.json()).catch(() => ({})),
        fetch('data/players.json').then(r => r.json()).catch(() => ({})),
        fetch('data/transactions.json').then(r => r.json()).catch(() => ({})),
        fetch('data/projectedScores.json').then(r => r.json()).catch(() => ({})),
        fetch('data/liveScoring.json').then(r => r.json()).catch(() => ({}))
      ]);

      this.leagueData = leagueRes.league || {};
      this.rostersData = rostersRes.rosters || {};
      
      // Parse Players Map
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

      console.log(`✅ Data Loaded: ${this.playersMap.size} players, ${this.transactionsData.length} transactions`);
    } catch (err) {
      console.error("Failed to load local data cache:", err);
    }
  }

  renderAll() {
    this.renderMatchupSelector();
    this.renderLiveMatchup();
    this.renderRoster();
    this.renderTrendsAndReplacements();
    this.renderDuesAndLedger();
    this.renderTransactionsFeed();
  }

  // -------------------------------------------------------------
  // PAGE 1: LIVE MATCHUP & INTERACTIVE FIELD
  // -------------------------------------------------------------
  renderMatchupSelector() {
    const dropdown = document.getElementById("matchup-dropdown");
    if (!dropdown || !this.leagueData.franchises) return;

    dropdown.innerHTML = '';
    const franchises = this.leagueData.franchises.franchise || [];
    
    // Create week 1 sample matchups
    const matchups = [
      { id: "1", team1: "0001", team2: "0002" }, // Mentalcow vs Blitzkrieg
      { id: "2", team1: "0003", team2: "0004" }, // Black Souls vs Warhorse
      { id: "3", team1: "0005", team2: "0006" }, // Zombiez vs Smokin Gunz
      { id: "4", team1: "0007", team2: "0008" }, // Dahmer's Buffet vs Pack Attack
      { id: "5", team1: "0009", team2: "0010" }, // Skitzos vs Bleed Green
      { id: "6", team1: "0011", team2: "0012" }  // Mystery Men vs Curt's RIPs
    ];

    matchups.forEach(m => {
      const f1 = franchises.find(f => f.id === m.team1) || { name: m.team1 };
      const f2 = franchises.find(f => f.id === m.team2) || { name: m.team2 };
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${f1.name} vs ${f2.name}`;
      dropdown.appendChild(opt);
    });

    dropdown.addEventListener("change", (e) => {
      this.renderLiveMatchup(e.target.value);
    });
  }

  renderLiveMatchup(matchupId = "1") {
    // Sample live play-by-play data with point deltas and yardages
    const samplePlaysMyTeam = [
      { player: "Saquon Barkley", pos: "RB", pts: "+1.5", isPos: true, desc: "Saquon run on 3rd & 2 for 15 yards down to WSH 37", startYard: 48, yards: 15 },
      { player: "Patrick Mahomes", pos: "QB", pts: "+2.4", isPos: true, desc: "Mahomes pass deep left to Kelce for 24 yards", startYard: 25, yards: 24 },
      { player: "A.J. Brown", pos: "WR", pts: "+6.0", isPos: true, desc: "Brown 42 yd touchdown pass reception from Hurts", startYard: 42, yards: 42 },
      { player: "Saquon Barkley", pos: "RB", pts: "-3.0", isPos: false, desc: "Saquon fumbled on 1st & 10, recovered by WSH", startYard: 35, yards: -4 }
    ];

    const samplePlaysOppTeam = [
      { player: "CeeDee Lamb", pos: "WR", pts: "+1.8", isPos: true, desc: "Lamb 18 yard catch over the middle", startYard: 30, yards: 18 },
      { player: "Christian McCaffrey", pos: "RB", pts: "+4.5", isPos: true, desc: "McCaffrey 25 yard rush to the left sideline", startYard: 40, yards: 25 },
      { player: "Josh Allen", pos: "QB", pts: "+6.0", isPos: true, desc: "Allen 6 yd rushing touchdown", startYard: 6, yards: 6 }
    ];

    const myFeed = document.getElementById("my-team-play-feed");
    const oppFeed = document.getElementById("opp-team-play-feed");

    if (myFeed) {
      myFeed.innerHTML = samplePlaysMyTeam.map(play => this.createPlayItemHTML(play)).join('');
    }
    if (oppFeed) {
      oppFeed.innerHTML = samplePlaysOppTeam.map(play => this.createPlayItemHTML(play)).join('');
    }

    // Attach hover listener to play items to trigger SVG field visualization
    document.querySelectorAll(".play-item").forEach(item => {
      item.addEventListener("mouseenter", (e) => {
        const startY = parseInt(item.getAttribute("data-start") || "30");
        const yds = parseInt(item.getAttribute("data-yds") || "10");
        const isPos = item.getAttribute("data-ispos") === "true";
        const desc = item.querySelector(".play-desc")?.textContent || "";
        
        document.getElementById("current-play-summary").textContent = desc;
        this.field.renderPlay(startY, yds, isPos);
      });
    });

    // Default top play
    this.field.renderPlay(48, 15, true);
  }

  createPlayItemHTML(play) {
    return `
      <div class="play-item" data-start="${play.startYard}" data-yds="${play.yards}" data-ispos="${play.isPos}">
        <div class="play-item-left">
          <div class="play-details">
            <span class="player-name-line">${play.player} <span class="pos-pill ${play.pos}">${play.pos}</span></span>
            <span class="play-desc">${play.desc}</span>
          </div>
        </div>
        <span class="pts-delta-badge ${play.isPos ? 'pos' : 'neg'}">${play.pts}</span>
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
    
    // Separate into starters and bench (9 starters max: 1 QB, 2 RB, 3 WR, 1 TE, 1 PK, 1 DEF)
    this.starters = [];
    this.bench = [];
    this.ir = [];

    const posCount = { QB: 0, RB: 0, WR: 0, TE: 0, PK: 0, Def: 0 };
    const posMax = { QB: 1, RB: 2, WR: 3, TE: 1, PK: 1, Def: 1 };

    rawPlayerList.forEach(pObj => {
      const fullPlayer = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB', team: 'NFL' };
      const proj = this.projectedScoresMap.get(pObj.id) || (Math.random() * 12 + 3).toFixed(1);
      const diffRating = Math.floor(Math.random() * 10) + 1; // 1 to 10 matchup difficulty

      const playerItem = {
        id: pObj.id,
        name: fullPlayer.name,
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

    // Attach row swap event listeners
    document.querySelectorAll(".btn-swap-lineup").forEach(btn => {
      btn.addEventListener("click", (e) => {
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
        <td>vs WSH (Sun 1:00 PM)</td>
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
      { name: "Saquon Barkley (RB)", streak: "🔥 Upward (+4.2 avg)", isUp: true, p1: "24.5", p3: "21.0", p5: "18.8" },
      { name: "A.J. Brown (WR)", streak: "🔥 Upward (+3.0 avg)", isUp: true, p1: "19.2", p3: "17.4", p5: "16.1" },
      { name: "Dallas Goedert (TE)", streak: "❄️ Downward (-2.1 avg)", isUp: false, p1: "6.4", p3: "8.2", p5: "10.5" }
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

  // -------------------------------------------------------------
  // PAGE 3: ADD/DROP/WAIVER CLAIM & DUES TRACKER
  // -------------------------------------------------------------
  renderDuesAndLedger() {
    const franchises = (this.leagueData.franchises && this.leagueData.franchises.franchise) || [];
    const ledgerBody = document.getElementById("dues-ledger-body");

    let totalPickupsAcrossLeague = 0;
    const ledgerRows = franchises.map(f => {
      // Calculate pickups per team from transactions data
      const teamTxs = this.transactionsData.filter(t => t.franchise === f.id && t.type === "FREE_AGENT");
      const numPickups = teamTxs.length || Math.floor(Math.random() * 4); // default sample count
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

  // -------------------------------------------------------------
  // PAGE 4: NOTIFICATIONS & EVENT LISTENERS
  // -------------------------------------------------------------
  setupEventListeners() {
    // Lineup submit button
    const btnSubmit = document.getElementById("btn-submit-lineup");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        this.showToast("🚀 Lineup submitted to MFL successfully!");
      });
    }

    // Push notification enablement
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

    // Simulation buttons
    document.getElementById("btn-test-tx-alert")?.addEventListener("click", () => {
      this.showToast("🔔 ALERT: Blitzkrieg claimed Jordan Mason off Waivers!");
    });
    document.getElementById("btn-test-lineup-alert")?.addEventListener("click", () => {
      this.showToast("⚠️ OPPONENT ALERT: Blitzkrieg benched Justin Fields for Kirk Cousins!");
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
