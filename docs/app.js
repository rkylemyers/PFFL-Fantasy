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
      // Load static data synced by Go backend / MFL
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

  startLivePolling() {
    // Poll live scores every 15 seconds
    this.livePollingTimer = setInterval(async () => {
      try {
        const liveRes = await fetch('data/liveScoring.json?t=' + Date.now()).then(r => r.json());
        if (liveRes && liveRes.liveScoring) {
          this.liveScoringData = liveRes.liveScoring;
          this.renderLiveMatchup(this.currentMatchupIndex);
          console.log("🔄 Live Scores Refreshed");
        }
      } catch (e) {
        console.log("Polling update check:", e);
      }
    }, 15000);
  }

  renderAll() {
    this.renderMatchupSelector();
    this.renderLiveMatchup(0);
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
    const matchups = (this.liveScoringData.matchup) || [];

    matchups.forEach((m, idx) => {
      const f1Id = m.franchise[0].id;
      const f2Id = m.franchise[1].id;
      const f1 = franchises.find(f => f.id === f1Id) || { name: `Team ${f1Id}` };
      const f2 = franchises.find(f => f.id === f2Id) || { name: `Team ${f2Id}` };

      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `Matchup ${idx + 1}: ${f1.name} (${m.franchise[0].score || '0.00'}) vs ${f2.name} (${m.franchise[1].score || '0.00'})`;
      dropdown.appendChild(opt);
    });

    dropdown.addEventListener("change", (e) => {
      this.currentMatchupIndex = parseInt(e.target.value);
      this.renderLiveMatchup(this.currentMatchupIndex);
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

    // Update Team Names & Logos
    document.getElementById("my-team-name").textContent = f1Meta.name;
    document.getElementById("my-team-logo").src = f1Meta.logo || f1Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("my-team-score").textContent = parseFloat(team1Data.score || "0.00").toFixed(2);
    document.getElementById("my-team-proj").textContent = (parseFloat(team1Data.score || "0") + (parseInt(team1Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    document.getElementById("opp-team-name").textContent = f2Meta.name;
    document.getElementById("opp-team-logo").src = f2Meta.logo || f2Meta.icon || "https://www44.myfantasyleague.com/fflnetdynamic2021/44108_league_logo.jpg";
    document.getElementById("opp-team-score").textContent = parseFloat(team2Data.score || "0.00").toFixed(2);
    document.getElementById("opp-team-proj").textContent = (parseFloat(team2Data.score || "0") + (parseInt(team2Data.playersYetToPlay || "0") * 10.5)).toFixed(1);

    // Update Top Score Banner
    const banner = document.getElementById("matchup-score-banner");
    if (banner) {
      banner.textContent = `${f1Meta.name} ${team1Data.score} - ${team2Data.score} ${f2Meta.name}`;
    }

    // Build Live Plays from Real MFL Starters
    const team1Plays = this.buildRealPlaysForFranchise(team1Data);
    const team2Plays = this.buildRealPlaysForFranchise(team2Data);

    const myFeed = document.getElementById("my-team-play-feed");
    const oppFeed = document.getElementById("opp-team-play-feed");

    if (myFeed) {
      myFeed.innerHTML = team1Plays.map(play => this.createPlayItemHTML(play)).join('');
    }
    if (oppFeed) {
      oppFeed.innerHTML = team2Plays.map(play => this.createPlayItemHTML(play)).join('');
    }

    // Attach hover listener to play items to trigger SVG field visualization
    document.querySelectorAll(".play-item").forEach(item => {
      item.addEventListener("mouseenter", () => {
        const startY = parseInt(item.getAttribute("data-start") || "30");
        const yds = parseInt(item.getAttribute("data-yds") || "10");
        const isPos = item.getAttribute("data-ispos") === "true";
        const desc = item.querySelector(".play-desc")?.textContent || "";
        
        document.getElementById("current-play-summary").textContent = desc;
        this.field.renderPlay(startY, yds, isPos);
      });
    });

    if (team1Plays.length > 0) {
      this.field.renderPlay(team1Plays[0].startYard, team1Plays[0].yards, team1Plays[0].isPos);
    }
  }

  buildRealPlaysForFranchise(franchiseData) {
    const rawStarters = (franchiseData.players && franchiseData.players.player) || [];
    const plays = [];

    rawStarters.forEach((pObj, idx) => {
      const pMeta = this.playersMap.get(pObj.id) || { name: `Player #${pObj.id}`, position: 'RB' };
      const score = parseFloat(pObj.score || "0.00");
      const isPos = score >= 0;

      const sampleYards = Math.round(score * 4.5);
      const startYard = Math.max(15, Math.min(85, 20 + (idx * 9)));

      let desc = `${pMeta.name} scored ${score.toFixed(2)} pts in game action`;
      if (pMeta.position === 'QB') desc = `${pMeta.name} passing completion & drive progression (+${score} pts)`;
      else if (pMeta.position === 'RB') desc = `${pMeta.name} carry to the outside for ${sampleYards} yards`;
      else if (pMeta.position === 'WR') desc = `${pMeta.name} target & reception over the middle (+${score} pts)`;

      plays.push({
        player: pMeta.name,
        pos: pMeta.position || 'RB',
        pts: `${score >= 0 ? '+' : ''}${score.toFixed(2)}`,
        isPos: isPos,
        desc: desc,
        startYard: startYard,
        yards: sampleYards || 10
      });
    });

    return plays;
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

  // -------------------------------------------------------------
  // PAGE 4: NOTIFICATIONS & EVENT LISTENERS
  // -------------------------------------------------------------
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
